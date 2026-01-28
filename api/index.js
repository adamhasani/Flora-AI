const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- 1. SETUP & CLEANING API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k => k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// Helper Search
function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gta"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan"];
    return text.toLowerCase().split(/\s+/).filter(word => !stopWords.includes(word) && word.length > 2).join(" ");
}

const promptFlora = (context) => `
Kamu adalah Flora AI (Versi 3.0). 
Gaya bicara: Santai, cerdas, to-the-point, bahasa Indonesia gaul.
Gunakan HTML <b> untuk poin penting.
${context ? `[DATA WEB REAL-TIME]:\n${context}\n\nJawab pakai data ini!` : ""}
`;

// --- 2. SEARCH ENGINE (TAVILY) ---
async function searchWeb(rawQuery) {
    if (!tavilyKey) return { data: "", log: "⚠️ Tavily Key Missing" };
    const cleanQuery = extractKeywords(rawQuery);
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: cleanQuery, max_results: 1, include_answer: true })
        });
        const data = await res.json();
        const result = data.answer || (data.results && data.results[0] ? data.results[0].content : "");
        return { data: result, log: "✅ Search Berhasil" };
    } catch (e) { 
        return { data: "", log: "❌ Search Error: " + e.message }; 
    }
}

// --- 3. CORE: GEMINI WITH ERROR REPORTING ---
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("API Key Gemini tidak ditemukan.");

    const MODEL_PRIORITY = ["gemini-3-flash-preview", "gemini-2.0-flash-exp"];
    let logs = [];

    for (const modelName of MODEL_PRIORITY) {
        for (const [idx, key] of geminiKeys.entries()) {
            try {
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// 1. SETUP API KEYS & CONFIG
// ==========================================
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

// Ambil banyak key Gemini (pisahkan dengan koma di .env)
const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k => k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Bersihkan query untuk search agar lebih akurat
function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan"];
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    return keywords.length > 2 ? keywords : text;
}

// Deteksi apakah perlu browsing internet
function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gta"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

// System Instruction (Otak Flora)
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
// 4. UTAMA: GEMINI (Support Rotasi & Log)
// ==========================================
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");

    // Urutan prioritas model
    const MODEL_PRIORITY = ["gemini-2.0-flash-exp", "gemini-1.5-flash"];
    
    // Format history untuk Gemini
    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }] 
    }));

    // Loop Model (Coba yang paling canggih dulu)
    for (const modelName of MODEL_PRIORITY) {
        // Loop Key (Rotasi jika limit)
        for (const key of geminiKeys) {
            try {
                // LOG: Memberi tahu di console kita sedang pakai apa
                console.log(`🔄 Mencoba: ${modelName} | Key: ...${key.slice(-4)}`);

                const genAI = new GoogleGenerativeAI(key);
                const model = genAI.getGenerativeModel({ 
                    model: modelName, 
                    systemInstruction: promptFlora(searchContext) 
                });

                // Tentukan Label Output
                let label = modelName.includes("2.0") ? "Flora (Gemini 2.0)" : "Flora (Gemini 1.5)";

                // Mode Gambar vs Teks
                if (imageBase64) {
                    const base64Data = imageBase64.split(",")[1];
                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                    const result = await model.generateContent([message || "Analisis gambar", { inlineData: { data: base64Data, mimeType } }]);
                    
                    console.log(`✅ SUKSES: ${label}`);
                    return { text: result.response.text(), label: label };
                } else {
                    const chat = model.startChat({ history: chatHistory });
                    const result = await chat.sendMessage(message);
                    
                    console.log(`✅ SUKSES: ${label}`);
                    return { text: result.response.text(), label: label };
                }

            } catch (e) {
                console.error(`❌ Gagal ${modelName}: ${e.message}`);
                
                // Jika errornya "Not Found" atau "Invalid" (Model belum rilis/salah nama), GANTI MODEL
                if (e.message.includes("404") || e.message.includes("not found") || e.message.includes("400")) {
                    console.log(`⚠️ Model ${modelName} bermasalah/belum siap. Skip...`);
                    break; // Keluar dari loop Key, lanjut ke Model berikutnya di array
                }
                
                // Jika error lain (Limit/Overload), coba Key berikutnya (continue loop key)
                continue; 
            }
        }
    }
    throw new Error("Semua Key/Model Gemini Gagal.");
}

// ==========================================
// 5. BACKUP: GROQ & MISTRAL
// ==========================================
async function runBackup(provider, message, imageBase64, searchContext, history) {
    const isGroq = provider === 'groq';
    const key = isGroq ? groqKey : mistralKey;
    const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.mistral.ai/v1/chat/completions";
    
    // Config Model Backup
    const textModel = isGroq ? "llama-3.3-70b-versatile" : "mistral-small-latest";
    const visionModel = isGroq ? "llama-3.2-90b-vision-preview" : "pixtral-12b-2409";
    
    // Label Output
    const label = isGroq ? "Flora (Llama 3.3)" : "Flora (Mistral)";

    if (!key) throw new Error(`${provider} Key Missing`);
    
    console.log(`🔄 Mencoba Backup: ${provider.toUpperCase()} (${textModel})...`);

    let fullMessages = [];

    // Mode Vision untuk Backup
    if (imageBase64) {
        const contentBody = [{ type: "text", text: message || "Jelaskan gambar ini" }];
        // Format image url beda dikit antara Groq dan Mistral biasanya, tapi standard OpenAI begini:
        contentBody.push({ type: "image_url", image_url: { url: imageBase64 } });

        fullMessages = [
            { role: "system", content: promptFlora(searchContext) },
            { role: "user", content: contentBody }
        ];
    } else {
        // Mode Chat Text Biasa
        fullMessages = [
            { role: "system", content: promptFlora(searchContext) },
            ...history, 
            { role: "user", content: message }
        ];
    }

    const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ 
            model: imageBase64 ? visionModel : textModel, 
            messages: fullMessages 
        })
    });

    if (!res.ok) {
        const errData = await res.text();
        throw new Error(`${provider} Error: ${errData}`);
    }
    
    const data = await res.json();
    console.log(`✅ SUKSES: ${label}`);
    
    return { 
        text: data.choices[0].message.content, 
        label: label 
    };
}

// ==========================================
// 6. HANDLER UTAMA (SERVER)
// ==========================================
module.exports = async (req, res) => {
    // Header agar bisa diakses dari mana saja (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        
        // --- STEP 1: WEB SEARCH (Jika perlu) ---
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            // Timeout 2 detik agar tidak kelamaan nunggu search
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 2500));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        // --- STEP 2: AI CHAIN REACTION ---
        let result = { text: "", label: "" };

        try {
            // Priority 1: GEMINI
            result = await runGemini(message, image, searchContext, history);
        } catch (geminiError) {
            console.warn("⚠️ Gemini Gagal, pindah ke Groq...", geminiError.message);
            
            try {
                // Priority 2: GROQ
                result = await runBackup('groq', message, image, searchContext, history);
            } catch (groqError) {
                console.warn("⚠️ Groq Gagal, pindah ke Mistral...", groqError.message);
                
                try {
                    // Priority 3: MISTRAL
                    result = await runBackup('mistral', message, image, searchContext, history);
                } catch (mistralError) {
                    console.error("❌ Semua AI Gagal.");
                    return res.json({ reply: "Duh, semua server lagi sibuk banget nih. Coba lagi bentar ya!" });
                }
            }
        }

        // --- STEP 3: FINAL RESPONSE ---
        // Menggabungkan Label + Jawaban
        return res.json({ 
            reply: `<b>[${result.label}]</b><br>${result.text}` 
        });

    } catch (err) {
        console.error("Critical Server Error:", err);
        return res.json({ reply: `Error System: ${err.message}` });
    }
};
