const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// 1. SETUP API KEYS (VERCEL SUPPORT)
// ==========================================
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

// Ambil Key dari Environment Vercel
const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k => k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// ==========================================
// 2. HELPER: CLEANING SERVICE (PENTING!)
// ==========================================

// Hapus label [Flora...] dari teks agar tidak double saat dibaca AI
function cleanReply(text) {
    if (typeof text !== 'string') return text;
    // Hapus tag HTML bold + kurung siku di awal kalimat
    return text.replace(/^<b>\[.*?\]<\/b><br>/i, "").trim();
}

// Bersihkan History untuk AI yang Strict (Mistral & Groq)
function getCleanHistory(history) {
    return history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        // Cuci kontennya dari label sistem
        content: cleanReply(msg.content || "") 
    }));
}

// Helper Search
function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan", "update", "berita"];
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    return keywords.length > 2 ? keywords : text;
}

function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gempa", "banjir", "skor"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

// System Prompt
const promptFlora = (context) => `
Kamu adalah Flora AI (Versi 5.0). 
Gaya bicara: Santai, cerdas, to-the-point, bahasa Indonesia gaul.
Gunakan HTML <b> untuk poin penting.
Ingat konteks percakapan sebelumnya.
JANGAN menulis label namamu sendiri (seperti [Flora]). Langsung jawab saja isinya.
${context ? `[DATA WEB REAL-TIME]:\n${context}\n\nJawab pertanyaan user berdasarkan data update di atas!` : ""}
`;

// ==========================================
// 3. SEARCH ENGINE (TAVILY)
// ==========================================
async function searchWeb(rawQuery) {
    if (!tavilyKey) return "";
    const cleanQuery = extractKeywords(rawQuery);
    // console.log(`🔎 Searching: "${cleanQuery}"`);
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

// ==========================================
// 4. UTAMA: GEMINI (AUTO 3.0 -> 2.0)
// ==========================================
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");

    // Strategi: Coba model masa depan dulu, baru model sekarang
    const MODEL_PRIORITY = [
        "gemini-3.0-pro-exp",       // Prediksi Model Baru
        "gemini-3.0-flash-preview", // Prediksi Model Baru
        "gemini-2.0-flash-exp",     // Model Canggih Saat Ini
        "gemini-1.5-flash"          // Model Paling Stabil
    ]; 

    // Bersihkan history khusus format Gemini
    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: cleanReply(msg.content) }] 
    }));

    for (const modelName of MODEL_PRIORITY) {
        for (const key of geminiKeys) {
            try {
                const genAI = new GoogleGenerativeAI(key);
                const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: promptFlora(searchContext) });
                
                // Label Dinamis
                let label = "Flora (Gemini)";
                if (modelName.includes("3.0")) label = "Flora (Gemini 3.0 🔥)";
                else if (modelName.includes("2.0")) label = "Flora (Gemini 2.0 ⚡)";

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
                // Hanya skip jika model tidak ditemukan (belum rilis)
                if (e.message.includes("404") || e.message.includes("not found")) {
                    // console.log(`⚠️ Model ${modelName} belum siap. Skip...`);
                    break; 
                }
                // Jika error limit, coba key berikutnya
                continue; 
            }
        }
    }
    throw new Error("Gemini Models Failed");
}

// ==========================================
// 5. BACKUP 1: MISTRAL AI
// ==========================================
async function runMistral(message, imageBase64, searchContext, history) {
    if (!mistralKey) throw new Error("No Mistral Key");
    
    const model = imageBase64 ? "pixtral-12b-2409" : "mistral-small-latest";
    const label = "Flora (Mistral)";

    let messages = [{ role: "system", content: promptFlora(searchContext) }];
    
    if (imageBase64) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: message || "Jelaskan gambar ini" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
    } else {
        messages = messages.concat(getCleanHistory(history));
        messages.push({ role: "user", content: message });
    }

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${mistralKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages })
    });

    if (!res.ok) throw new Error("Mistral Busy");
    const data = await res.json();
    return { text: data.choices[0].message.content, label };
}

// ==========================================
// 6. BACKUP 2: POLLINATIONS
// ==========================================
async function runPollinations(message, imageBase64, searchContext) {
    const label = "Flora (Pollinations)";
    const res = await fetch("https://text.pollinations.ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: [
                { role: "system", content: promptFlora(searchContext) },
                { role: "user", content: imageBase64 ? [{type:"text", text:message}, {type:"image_url", image_url:{url:imageBase64}}] : message }
            ],
            model: "openai", 
            jsonMode: false
        })
    });
    
    if (!res.ok) throw new Error("Pollinations Error");
    const text = await res.text();
    return { text, label };
}

// ==========================================
// 7. BACKUP 3: GROQ
// ==========================================
async function runGroq(message, imageBase64, searchContext, history) {
    if (!groqKey) throw new Error("No Groq Key");
    
    const model = imageBase64 ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";
    const label = "Flora (Groq)";
    
    let messages = [{ role: "system", content: promptFlora(searchContext) }];
    
    if (imageBase64) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: message || "Jelaskan gambar ini" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
    } else {
        messages = messages.concat(getCleanHistory(history));
        messages.push({ role: "user", content: message });
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages })
    });

    if (!res.ok) throw new Error("Groq Busy");
    const data = await res.json();
    return { text: data.choices[0].message.content, label };
}

// ==========================================
// 8. CONTROLLER UTAMA
// ==========================================
module.exports = async (req, res) => {
    // CORS Header agar bisa dipakai di WA Bot
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    try {
        // --- STEP 1: SEARCH ---
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 3000));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        let result = { text: "", label: "" };

        // --- STEP 2: CASCADE AI ---
        // Urutan: GEMINI -> MISTRAL -> POLLINATIONS -> GROQ
        try {
            result = await runGemini(message, image, searchContext, history);
        } catch (e1) {
            console.log("⚠️ Gemini Skip:", e1.message);
            try {
                result = await runMistral(message, image, searchContext, history);
            } catch (e2) {
                console.log("⚠️ Mistral Skip:", e2.message);
                try {
                    result = await runPollinations(message, image, searchContext);
                } catch (e3) {
                    try {
                        result = await runGroq(message, image, searchContext, history);
                    } catch (e4) {
                        return res.json({ reply: "Semua server AI sibuk." });
                    }
                }
            }
        }

        // --- STEP 3: FINAL TOUCH ---
        // Pastikan jawaban AI bersih dari label buatan dia sendiri
        const cleanText = cleanReply(result.text);

        return res.json({ 
            reply: `<b>[${result.label}]</b><br>${cleanText}` 
        });

    } catch (err) {
        return res.json({ reply: `System Error: ${err.message}` });
    }
};
