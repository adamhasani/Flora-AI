const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SETUP ROTASI KUNCI ---
// Masukkan semua kunci di Vercel variable: GEMINI_KEYS
// Format: key1,key2,key3 (dipisah koma)
const rawKeys = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "";
const apiKeys = rawKeys.split(",").map(k => k.replace(/\\n/g, "").trim()).filter(k => k.length > 0);

if (apiKeys.length === 0) throw new Error("GEMINI_KEYS kosong! Masukkan minimal satu key.");

// Prompt Sistem
const promptFlora = "Kamu Flora AI. Jawab santai, singkat, jelas. Gunakan HTML <b> untuk poin penting.";

// --- DAFTAR MODEL YANG AKAN DICOBA (URUT DARI YANG TERTINGGI) ---
const MODEL_PRIORITY = [
    "gemini-3-flash-preview",  // Prioritas 1: Sesuai request (Masa Depan)
    "gemini-2.0-flash-exp"     // Prioritas 2: Flash '2.5' / Next Gen (Backup Valid)
];

// --- FUNGSI UTAMA (KEY ROTATION + MODEL FALLBACK) ---
async function runGeminiUltimate(message, imageBase64, history) {
    let lastError = null;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Mistral } = require("@mistralai/mistralai");
const Groq = require("groq-sdk");
const { tavily } = require("@tavily/core");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

// Gemini Keys (Bisa banyak, dipisah koma buat rotasi)
const rawGeminiKeys = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "";
const geminiKeys = rawGeminiKeys.split(",").map(k => k.replace(/\\n/g, "").trim()).filter(k => k.length > 0);

const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

const mistralClient = new Mistral({ apiKey: mistralKey || "dummy" });
const groq = new Groq({ apiKey: groqKey || "dummy" });
const tavilyClient = tavily({ apiKey: tavilyKey || "dummy" });

// --- PROMPT CANGGIH DENGAN CONTEXT TAVILY ---
const generatePrompt = (context) => `
Kamu adalah Flora AI. 
Gaya: Santai, singkat, jelas, bahasa Indonesia gaul dikit boleh.
Tugas: Jawab pertanyaan user.
Format: Gunakan HTML <b> untuk poin penting.

${context ? `
[DATA REAL-TIME DARI INTERNET]:
${context}

INSTRUKSI PENTING:
- Data di atas adalah FAKTA TERBARU (2025-2026).
- Gunakan data tersebut sebagai prioritas utama jawabanmu.
- Abaikan pengetahuan lama kamu jika bertentangan dengan data di atas.
` : ""}
`;

// --- 1. FUNGSI SEARCH (TAVILY) ---
async function searchWeb(query) {
    if (!tavilyKey) return "";
    try {
        console.log(`🌐 Tavily Mencari Fakta 2025/2026: "${query}"...`);
        const result = await tavilyClient.search(query, {
            search_depth: "basic", 
            max_results: 3,
            include_answer: true // Biar Tavily kasih rangkuman langsung
        });
        
        // Ambil rangkuman langsung atau snippet berita
        const content = result.answer || result.results.map(r => `- ${r.content}`).join("\n");
        return content;
    } catch (e) {
        console.error("Tavily Error:", e.message);
        return ""; // Lanjut tanpa data internet
    }
}

// --- 2. ENGINE 1: GEMINI (ROTATION + FALLBACK MODEL) ---
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");

    const MODEL_LIST = ["gemini-3-flash-preview", "gemini-2.0-flash-exp"];
    let lastError = null;

    // Loop Model (3.0 dulu, baru 2.0)
    for (const modelName of MODEL_LIST) {
        // Loop Key (Rotasi Anti-Limit)
        for (const apiKey of geminiKeys) {
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ 
                    model: modelName, 
                    systemInstruction: generatePrompt(searchContext) 
                });

                if (imageBase64) {
                    const base64Data = imageBase64.split(",")[1];
                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                    const result = await model.generateContent([
                        message || "Jelaskan gambar ini", 
                        { inlineData: { data: base64Data, mimeType } }
                    ]);
                    return { text: result.response.text(), label: modelName.includes("gemini-3") ? "Flora 3.0" : "Flora 2.0" };
                } else {
                    const chat = model.startChat({
                        history: history.map(m => ({ role: m.role==='model'?'model':'user', parts: [{ text: m.content.replace(/<[^>]*>/g, '') }] })),
                    });
                    const result = await chat.sendMessage(message);
                    return { text: result.response.text(), label: modelName.includes("gemini-3") ? "Flora 3.0" : "Flora 2.0" };
                }
            } catch (error) {
                lastError = error;
                // Kalau error limit (429), lanjut key berikutnya. Kalau model not found (404), break ke model berikutnya.
                if (error.message.includes("404") || error.message.includes("not found")) break; 
                continue;
            }
        }
    }
    throw lastError || new Error("Semua Gemini Gagal");
}

// --- 3. ENGINE 2: MISTRAL (BACKUP) ---
async function runMistral(message, imageBase64, searchContext) {
    if (!mistralKey) throw new Error("No Mistral Key");
    const model = imageBase64 ? "pixtral-12b-2409" : "mistral-small-latest";
    
    const result = await mistralClient.chat.complete({
        model: model,
        messages: [
            { role: "system", content: generatePrompt(searchContext) },
            { role: "user", content: imageBase64 ? [{type:"text", text:message}, {type:"image_url", imageUrl:imageBase64}] : message }
        ]
    });
    return result.choices[0].message.content;
}

// --- 4. ENGINE 3: GROQ (BACKUP TERAKHIR) ---
async function runGroq(message, imageBase64, searchContext) {
    if (!groqKey) throw new Error("No Groq Key");
    const model = imageBase64 ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";
    
    const result = await groq.chat.completions.create({
        messages: [
            { role: "system", content: generatePrompt(searchContext) },
            { role: "user", content: imageBase64 ? [{type:"text", text:message}, {type:"image_url", image_url:{url:imageBase64}}] : message }
        ],
        model: model,
    });
    return result.choices[0].message.content;
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;
    let searchContext = "";

    try {
        // STEP 1: SEARCHING (Hanya jika teks & bukan sapaan pendek)
        // Tavily akan mencari info 2025-2026 jika pertanyaan user relevan
        if (!image && message && message.length > 3 && tavilyKey) {
            // Trik: Cek apakah pertanyaan butuh fakta? (Sementara kita hajar semua query panjang biar aman)
            searchContext = await searchWeb(message);
        }

        // STEP 2: COBA GEMINI (3.0 -> 2.0)
        try {
            console.log("Mencoba Gemini...");
            const { text, label } = await runGemini(message, image, searchContext, history);
            const finalLabel = image ? `[Vision ${label}]` : `[${label}]`;
            return res.json({ reply: `<b>${finalLabel}</b><br>${text}` });
        } catch (e1) {
            console.log("Gemini Skip:", e1.message);

            // STEP 3: COBA MISTRAL
            try {
                console.log("Switch Mistral...");
                const reply = await runMistral(message, image, searchContext);
                return res.json({ reply: `<b>[Backup Mistral]</b><br>${reply}` });
            } catch (e2) {
                console.log("Mistral Skip:", e2.message);

                // STEP 4: COBA GROQ
                try {
                    console.log("Switch Groq...");
                    const reply = await runGroq(message, image, searchContext);
                    return res.json({ reply: `<b>[Backup Groq]</b><br>${reply}` });
                } catch (e3) {
                    return res.json({ reply: "<b>[SYSTEM DOWN]</b><br>Semua server sibuk." });
                }
            }
        }
    } catch (err) {
        return res.json({ reply: `Error: ${err.message}` });
    }
};
