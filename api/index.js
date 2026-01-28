const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

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
        console.error("❌ Tavily Error:", e.message);
        return ""; 
    }
}

// --- 2. GEMINI (MODEL HUNTER: 3.0 -> 2.0) ---
async function runGemini(message, imageBase64, searchContext, history, attemptLog) {
    if (geminiKeys.length === 0) {
        attemptLog.push({ provider: "Gemini", status: "Failed", reason: "No API Keys Configured" });
        throw new Error("No Gemini Keys");
    }

    const MODEL_PRIORITY = ["gemini-2.0-flash-exp", "gemini-1.5-flash"]; // Nama model disesuaikan agar valid
    
    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }] 
    }));

    for (const modelName of MODEL_PRIORITY) {
        for (let i = 0; i < geminiKeys.length; i++) {
            const key = geminiKeys[i];
            const keyLabel = `Key #${i+1}`;
            
            try {
                const genAI = new GoogleGenerativeAI(key);
                const model = genAI.getGenerativeModel({ 
                    model: modelName, 
                    systemInstruction: promptFlora(searchContext) 
                });

                let label = modelName.includes("2.0") ? "Flora 2.0" : "Flora 1.5";

                if (imageBase64) {
                    const base64Data = imageBase64.split(",")[1];
                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                    const result = await model.generateContent([message || "Analisis gambar", { inlineData: { data: base64Data, mimeType } }]);
                    return { text: result.response.text(), label: label, provider: "Gemini" };
                } else {
                    const chat = model.startChat({ history: chatHistory });
                    const result = await chat.sendMessage(message);
                    return { text: result.response.text(), label: label, provider: "Gemini" };
                }

            } catch (e) {
                const errorMsg = e.message || String(e);
                let reason = "Unknown Error";

                // Deteksi Jenis Error
                if (errorMsg.includes("404") || errorMsg.includes("not found") || errorMsg.includes("400")) {
                    reason = "Model Not Found / Invalid Name (Fatal)";
                    attemptLog.push({ provider: `Gemini (${modelName})`, key: keyLabel, status: "Failed", reason: reason, detail: errorMsg });
                    break; // Model ini salah nama, skip ke model berikutnya
                } else if (errorMsg.includes("429") || errorMsg.includes("503") || errorMsg.includes("quota")) {
                    reason = "Limit / Quota / Server Busy";
                    attemptLog.push({ provider: `Gemini (${modelName})`, key: keyLabel, status: "Failed", reason: reason, detail: errorMsg });
                    continue; // Key habis, coba key berikutnya
                } else {
                    // Error lain (Network, dsb)
                    attemptLog.push({ provider: `Gemini (${modelName})`, key: keyLabel, status: "Failed", reason: "Connection/Other", detail: errorMsg });
                    continue; 
                }
            }
        }
    }
    throw new Error("Semua Model Gemini Gagal.");
}

// --- 3. BACKUP (GROQ/MISTRAL) ---
async function runBackup(provider, message, imageBase64, searchContext, history, attemptLog) {
    const isGroq = provider === 'groq';
    const key = isGroq ? groqKey : mistralKey;
    const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.mistral.ai/v1/chat/completions";
    
    if (!key) {
        attemptLog.push({ provider: provider.toUpperCase(), status: "Skipped", reason: "No API Key" });
        throw new Error(`${provider} Key Missing`);
    }

    const model = isGroq ? "llama-3.3-70b-versatile" : "mistral-small-latest";
    let fullMessages = [
        { role: "system", content: promptFlora(searchContext) },
        ...history, 
        { role: "user", content: imageBase64 ? "Jelaskan gambar ini" : message }
    ];

    // Handle Vision Logic
    if (imageBase64) {
        const visionModel = isGroq ? "llama-3.2-90b-vision-preview" : "pixtral-12b-2409";
        const contentBody = [{type:"text", text:message}];
        if(isGroq) contentBody.push({type:"image_url", image_url:{url:imageBase64}});
        else contentBody.push({type:"image_url", imageUrl:imageBase64});

        fullMessages = [
            { role: "system", content: promptFlora(searchContext) },
            { role: "user", content: contentBody }
        ];
        
        try {
            const res = await fetch(url, {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
                body: JSON.stringify({ model: visionModel, messages: fullMessages })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error?.message || data.message || JSON.stringify(data));
            
            return { text: data.choices[0].message.content, provider: provider.toUpperCase() };
        } catch (e) {
            attemptLog.push({ provider: provider.toUpperCase(), model: visionModel, status: "Failed", reason: e.message });
            throw e;
        }
    }

    // Handle Text Logic
    try {
        const res = await fetch(url, {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify({ model: model, messages: fullMessages })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error?.message || data.message || "HTTP Error");
        
        return { text: data.choices[0].message.content, provider: provider.toUpperCase() };

    } catch (e) {
        attemptLog.push({ provider: provider.toUpperCase(), model: model, status: "Failed", reason: e.message });
        throw e;
    }
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Array ini akan mencatat jejak error
    const attemptLog = []; 
    let finalResult = null;

    try {
        const { history = [], message, image } = req.body;
        
        // 1. Search
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            try {
                const searchPromise = searchWeb(message);
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 2000)); // Timeout 2 detik biar ga lama
                searchContext = await Promise.race([searchPromise, timeoutPromise]);
                if(searchContext) attemptLog.push({ provider: "Tavily Search", status: "Success" });
            } catch (e) {
                attemptLog.push({ provider: "Tavily Search", status: "Failed", reason: e.message });
            }
        }

        // 2. AI Chain
        // STEP A: GEMINI
        try {
            finalResult = await runGemini(message, image, searchContext, history, attemptLog);
            attemptLog.push({ provider: "Gemini (Final)", status: "Success", modelUsed: finalResult.label });
        } catch (e1) {
            // STEP B: GROQ (Backup 1)
            console.log(`⚠️ Gemini Total Fail: ${e1.message}. Switching to Groq...`);
            try {
                finalResult = await runBackup('groq', message, image, searchContext, history, attemptLog);
                attemptLog.push({ provider: "Groq (Final)", status: "Success" });
            } catch (e2) {
                // STEP C: MISTRAL (Backup 2)
                console.log(`⚠️ Groq Total Fail: ${e2.message}. Switching to Mistral...`);
                try {
                    finalResult = await runBackup('mistral', message, image, searchContext, history, attemptLog);
                    attemptLog.push({ provider: "Mistral (Final)", status: "Success" });
                } catch (e3) {
                    // SEMUA GAGAL
                    attemptLog.push({ provider: "System", status: "Critical Failure", reason: "All providers failed" });
                    return res.status(500).json({ 
                        reply: "Sistem sedang overload. Semua server AI (Gemini, Groq, Mistral) mengalami masalah.",
                        debug: attemptLog // Kirim log error lengkap ke frontend
                    });
                }
            }
        }

        // SUKSES (Dari salah satu provider)
        return res.json({ 
            reply: `<b>[${finalResult.label || finalResult.provider}]</b><br>${finalResult.text}`,
            provider: finalResult.provider,
            debug: attemptLog // Sertakan log di response
        });

    } catch (err) {
        // Error di luar logika AI (misal parsing JSON body)
        return res.status(500).json({ 
            reply: `Internal Server Error: ${err.message}`,
            debug: attemptLog 
        });
    }
};
