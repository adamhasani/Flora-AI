const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

// Ambil banyak key Gemini buat rotasi
const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k=>k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// --- HELPER 1: BERSIHKAN QUERY SEARCH ---
function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan"];
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    return keywords.length > 2 ? keywords : text;
}

// --- HELPER 2: DETEKSI KEBUTUHAN SEARCH ---
function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gta"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

// --- PROMPT FLORA ---
const promptFlora = (context) => `
Kamu adalah Flora AI (Versi 3.0). 
Gaya bicara: Santai, cerdas, to-the-point, bahasa Indonesia gaul.
Gunakan HTML <b> untuk poin penting.
Ingat konteks percakapan sebelumnya.
${context ? `[DATA WEB REAL-TIME]:\n${context}\n\nJawab pakai data ini!` : ""}
`;

// --- 1. SEARCH WEB (TAVILY) ---
async function searchWeb(rawQuery) {
    if (!tavilyKey) return "";
    const cleanQuery = extractKeywords(rawQuery);
    console.log(`🔎 Searching 2026: "${cleanQuery}"`);

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: cleanQuery, max_results: 1, include_answer: true })
        });
        const data = await res.json();
        return data.answer || (data.results && data.results[0] ? data.results[0].content : "");
    } catch (e) { return ""; }
}

// --- 2. GEMINI (MODEL HUNTER: 3.0 -> 2.0) ---
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");

    // PRIORITAS MASA DEPAN:
    // 1. Gemini 3.0 Flash Preview (Target Utama)
    // 2. Gemini 2.0 Flash Experimental (Backup High-Tech)
    // Kita hapus 1.5 karena sudah usang.
    const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-2.0-flash-exp"];
    
    // Konversi History Frontend -> Gemini
    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }] 
    }));

    // LOOP MODEL (Cari yang paling canggih yang bisa jalan)
    for (const modelName of MODEL_PRIORITY) {
        // LOOP KEY (Rotasi Anti-Limit)
        for (const key of geminiKeys) {
            try {
                const genAI = new GoogleGenerativeAI(key);
                const model = genAI.getGenerativeModel({ 
                    model: modelName, 
                    systemInstruction: promptFlora(searchContext) 
                });

                // Set Label Output
                let label = modelName.includes("gemini-3") ? "Flora 3.0" : "Flora 2.0";

                if (imageBase64) {
                    // Vision Mode
                    const base64Data = imageBase64.split(",")[1];
                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                    const result = await model.generateContent([message || "Analisis gambar", { inlineData: { data: base64Data, mimeType } }]);
                    return { text: result.response.text(), label: label };
                } else {
                    // Chat Mode (Dengan Memory)
                    const chat = model.startChat({ history: chatHistory });
                    const result = await chat.sendMessage(message);
                    return { text: result.response.text(), label: label };
                }

            } catch (e) {
                // LOGIKA PENTING:
                // Jika errornya "404 Not Found" atau "400 Invalid" (Model belum rilis/salah nama)
                // -> BREAK loop Key, langsung loncat ke Model berikutnya (Downgrade ke 2.0)
                if (e.message.includes("404") || e.message.includes("not found") || e.message.includes("400")) {
                    console.log(`Model ${modelName} belum siap. Ganti model...`);
                    break; 
                }
                
                // Jika errornya Limit (429/503), coba Key berikutnya di model yang sama
                continue; 
            }
        }
    }
    throw new Error("Gemini 3.0 & 2.0 Gagal. Server Google lagi berat.");
}

// --- 3. BACKUP (GROQ/MISTRAL - SUPPORT MEMORY MANUAL) ---
async function runBackup(provider, message, imageBase64, searchContext, history) {
    const isGroq = provider === 'groq';
    const key = isGroq ? groqKey : mistralKey;
    const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.mistral.ai/v1/chat/completions";
    // Groq pakai Llama 3.3, Mistral pakai Small
    const model = isGroq ? "llama-3.3-70b-versatile" : "mistral-small-latest";

    if (!key) throw new Error(`${provider} Key Missing`);

    // Inject History manual
    let fullMessages = [
        { role: "system", content: promptFlora(searchContext) },
        ...history, 
        { role: "user", content: imageBase64 ? "Jelaskan gambar ini" : message }
    ];

    if (imageBase64) {
        const visionModel = isGroq ? "llama-3.2-90b-vision-preview" : "pixtral-12b-2409";
        const contentBody = [{type:"text", text:message}];
        if(isGroq) contentBody.push({type:"image_url", image_url:{url:imageBase64}});
        else contentBody.push({type:"image_url", imageUrl:imageBase64});

        fullMessages = [
            { role: "system", content: promptFlora(searchContext) },
            { role: "user", content: contentBody }
        ];
        
        const res = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({ model: visionModel, messages: fullMessages })
        });
        const data = await res.json();
        return data.choices[0].message.content;
    }

    const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model: model, messages: fullMessages })
    });
    if (!res.ok) throw new Error(`${provider} Error`);
    const data = await res.json();
    return data.choices[0].message.content;
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        
        // 1. Search (Tavily) - Cuma kalau teks panjang & ada trigger kata kunci
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 2000));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        // 2. AI Chain (Gemini 3.0 -> 2.0 -> Groq -> Mistral)
        try {
            const { text, label } = await runGemini(message, image, searchContext, history);
            return res.json({ reply: `<b>[${label}]</b><br>${text}` });
        } catch (e1) {
            console.log("Gemini Error:", e1.message);
            try {
                // Backup 1: Groq (Llama 3.3)
                const text = await runBackup('groq', message, image, searchContext, history);
                return res.json({ reply: `<b>[Flora Backup]</b><br>${text}` });
            } catch (e2) {
                try {
                    // Backup 2: Mistral
                    const text = await runBackup('mistral', message, image, searchContext, history);
                    return res.json({ reply: `<b>[Flora Last]</b><br>${text}` });
                } catch (e3) {
                    return res.json({ reply: "Sistem sibuk. Coba lagi nanti." });
                }
            }
        }
    } catch (err) {
        return res.json({ reply: `Error: ${err.message}` });
    }
};
