const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// 1. SETUP API KEYS & CONFIG
// ==========================================
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

// API Keys
const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k => k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Bersihkan query search
function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan"];
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    return keywords.length > 2 ? keywords : text;
}

// Deteksi trigger search
function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gta"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

// Prompt Utama
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
        console.error("Search Error:", e.message);
        return "";
    }
}

// ==========================================
// 4. FUNCTION GEMINI (Disimpan tapi tidak dipanggil)
// ==========================================
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");
    const MODEL_PRIORITY = ["gemini-2.0-flash-exp", "gemini-1.5-flash"];
    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }] 
    }));

    for (const modelName of MODEL_PRIORITY) {
        for (const key of geminiKeys) {
            try {
                const genAI = new GoogleGenerativeAI(key);
                const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: promptFlora(searchContext) });
                let label = modelName.includes("2.0") ? "Flora (Gemini 2.0)" : "Flora (Gemini 1.5)";

                if (imageBase64) {
                    const base64Data = imageBase64.split(",")[1];
                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                    const result = await model.generateContent([message || "Analisis gambar", { inlineData: { data: base64Data, mimeType } }]);
                    return { text: result.response.text(), label: label };
                } else {
                    const chat = model.startChat({ history: chatHistory });
                    const result = await chat.sendMessage(message);
                    return { text: result.response.text(), label: label };
                }
            } catch (e) {
                if (e.message.includes("404") || e.message.includes("not found")) break; 
                continue; 
            }
        }
    }
    throw new Error("Gemini Gagal.");
}

// ==========================================
// 5. FUNCTION BACKUP (GROQ & MISTRAL)
// ==========================================
async function runBackup(provider, message, imageBase64, searchContext, history) {
    const isGroq = provider === 'groq';
    const key = isGroq ? groqKey : mistralKey;
    const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.mistral.ai/v1/chat/completions";
    
    // Config Model
    const textModel = isGroq ? "llama-3.3-70b-versatile" : "mistral-small-latest";
    const visionModel = isGroq ? "llama-3.2-90b-vision-preview" : "pixtral-12b-2409";
    const label = isGroq ? "Flora (Llama 3.3)" : "Flora (Mistral)";

    if (!key) throw new Error(`${provider} Key Missing`);
    
    console.log(`🔄 Testing: ${provider.toUpperCase()} (${textModel})...`);

    let fullMessages = [];
    if (imageBase64) {
        const contentBody = [{ type: "text", text: message || "Jelaskan gambar ini" }];
        contentBody.push({ type: "image_url", image_url: { url: imageBase64 } });
        fullMessages = [{ role: "system", content: promptFlora(searchContext) }, { role: "user", content: contentBody }];
    } else {
        fullMessages = [{ role: "system", content: promptFlora(searchContext) }, ...history, { role: "user", content: message }];
    }

    const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: imageBase64 ? visionModel : textModel, messages: fullMessages })
    });

    if (!res.ok) {
        const errData = await res.text();
        throw new Error(`${provider} Error: ${errData}`);
    }
    
    const data = await res.json();
    console.log(`✅ SUKSES: ${label}`);
    return { text: data.choices[0].message.content, label: label };
}

// ==========================================
// 6. HANDLER UTAMA (MODE: FORCE GROQ)
// ==========================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        
        // --- STEP 1: WEB SEARCH (Tetap jalan) ---
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 2500));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        // --- STEP 2: AI EXECUTION (FORCE GROQ) ---
        // Kita langsung panggil Groq, tidak pakai Gemini.
        try {
            console.log("⚠️ MODE TEST: Memaksa pakai GROQ...");
            
            const result = await runBackup('groq', message, image, searchContext, history);
            
            return res.json({ 
                reply: `<b>[${result.label}]</b><br>${result.text}` 
            });

        } catch (groqError) {
            console.error("❌ Groq Error:", groqError.message);
            return res.json({ reply: `Error Groq: ${groqError.message}` });
        }

    } catch (err) {
        console.error("Critical Server Error:", err);
        return res.json({ reply: `Error System: ${err.message}` });
    }
};
