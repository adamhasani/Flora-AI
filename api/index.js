const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// 1. SETUP API KEYS & CONFIG
// ==========================================
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k => k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan"];
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    return keywords.length > 2 ? keywords : text;
}

function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gta"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

const promptFlora = (context) => `
Kamu adalah Flora AI (Versi 3.0). 
Gaya bicara: Santai, cerdas, to-the-point, bahasa Indonesia gaul.
Gunakan HTML <b> untuk poin penting.
Ingat konteks percakapan sebelumnya.
${context ? `[DATA WEB REAL-TIME]:\n${context}\n\nJawab pakai data ini!` : ""}
`;

// ==========================================
// 3. SEARCH ENGINE (TAVILY)
// ==========================================
async function searchWeb(rawQuery) {
    if (!tavilyKey) return "";
    const cleanQuery = extractKeywords(rawQuery);
    console.log(`🔎 Searching: "${cleanQuery}"`);

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: cleanQuery, max_results: 1, include_answer: true })
        });
        const data = await res.json();
        return data.answer || (data.results && data.results[0] ? data.results[0].content : "");
    } catch (e) {
        return "";
    }
}

// ==========================================
// 4. LOGIC MISTRAL (STANDALONE)
// ==========================================
async function runMistral(message, imageBase64, searchContext, history) {
    if (!mistralKey) throw new Error("MISTRAL_API_KEY tidak ditemukan!");
    
    const url = "https://api.mistral.ai/v1/chat/completions";
    
    // Model Config
    // Pixtral = Vision Model punya Mistral
    // Mistral Small = Model chat cepat
    const model = imageBase64 ? "pixtral-12b-2409" : "mistral-small-latest";
    const label = "Flora (Mistral)";

    console.log(`🔄 Testing MISTRAL (${model})...`);

    // --- CLEANING HISTORY ---
    // Wajib dibersihkan biar ga error 400 (Bad Request)
    const cleanHistory = history.map(msg => ({
        role: msg.role,
        content: msg.content
    }));

    let fullMessages = [];

    if (imageBase64) {
        // Mode Vision Mistral (Pixtral)
        const contentBody = [{ type: "text", text: message || "Jelaskan gambar ini" }];
        contentBody.push({ type: "image_url", imageUrl: imageBase64 }); // Note: Mistral kadang pakai 'imageUrl', OpenAI 'image_url' (cek dokumentasi terbaru, usually image_url is standard now but let's stick to standard)
        // Standard OpenAI format yang didukung Mistral:
        // content: [ {type: "text", text: "..."}, {type: "image_url", image_url: {url: "..."}} ]
        
        const standardContent = [
            { type: "text", text: message || "Jelaskan gambar ini" },
            { type: "image_url", image_url: { url: imageBase64 } }
        ];

        fullMessages = [
            { role: "system", content: promptFlora(searchContext) },
            { role: "user", content: standardContent }
        ];
    } else {
        // Mode Text Biasa
        fullMessages = [
            { role: "system", content: promptFlora(searchContext) },
            ...cleanHistory, 
            { role: "user", content: message }
        ];
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json", 
            "Authorization": `Bearer ${mistralKey}` 
        },
        body: JSON.stringify({ 
            model: model, 
            messages: fullMessages,
            temperature: 0.7 
        })
    });

    if (!res.ok) {
        const errData = await res.text();
        let errMsg = errData;
        try {
            const jsonErr = JSON.parse(errData);
            errMsg = jsonErr.error?.message || errData;
        } catch(e) {}
        throw new Error(errMsg);
    }
    
    const data = await res.json();
    console.log(`✅ SUKSES: ${label}`);
    
    return { 
        text: data.choices[0].message.content, 
        label: label 
    };
}

// ==========================================
// 5. HANDLER UTAMA (MODE: FORCE MISTRAL)
// ==========================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        
        // --- STEP 1: SEARCH ---
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 2500));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        // --- STEP 2: FORCE MISTRAL ---
        try {
            console.log("⚠️ MODE TEST: Memaksa pakai MISTRAL...");
            
            // Langsung panggil Mistral
            const result = await runMistral(message, image, searchContext, history);
            
            return res.json({ 
                reply: `<b>[${result.label}]</b><br>${result.text}` 
            });

        } catch (mistralError) {
            console.error("❌ Mistral Error:", mistralError.message);
            return res.json({ reply: `Error Mistral: ${mistralError.message}` });
        }

    } catch (err) {
        console.error("Critical System Error:", err);
        return res.json({ reply: `Error System: ${err.message}` });
    }
};
