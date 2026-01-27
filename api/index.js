const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
// Pastikan kamu punya GROQ_API_KEY, GEMINI_API_KEY, dan MISTRAL_API_KEY di Vercel
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

// --- PROMPT FLORA ---
const promptFlora = `
    Nama kamu Flora AI. Kamu asisten cerdas, asik, dan sangat membantu.
    Gaya bicara: Santai, informatif, dan menggunakan Bahasa Indonesia yang luwes.
    PENTING: Gunakan HTML <b>tebal</b>, <i>miring</i>, dan <br> untuk baris baru.
    JANGAN gunakan markdown (seperti ** atau ##).
`;

// Helper: Bersihkan respon
const cleanResponse = (text) => text ? text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, "<br>").trim() : "";

const getCleanHistory = (history) => history.map(msg => ({
    role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
    content: msg.content.replace(/<[^>]*>/g, '').trim()
}));

// ==========================================
// 1. ENGINE: GROQ (Llama 3.3 & Vision)
// ==========================================
async function runGroq(history, message, imageBase64) {
    let messages = [{ role: "system", content: promptFlora }, ...getCleanHistory(history)];
    
    if (imageBase64) {
        // Mode Vision (Llama 3.2)
        messages.push({
            role: "user",
            content: [
                { type: "text", text: message || "Jelaskan gambar ini" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
        const res = await groq.chat.completions.create({
            messages, model: "llama-3.2-11b-vision-preview", temperature: 0.6, max_tokens: 1024
        });
        return cleanResponse(res.choices[0]?.message?.content);
    } else {
        // Mode Teks (Llama 3.3 - Super Cepat)
        messages.push({ role: "user", content: message });
        const res = await groq.chat.completions.create({
            messages, model: "llama-3.3-70b-versatile", temperature: 0.7, max_tokens: 2048
        });
        return cleanResponse(res.choices[0]?.message?.content);
    }
}

// ==========================================
// 2. ENGINE: MISTRAL OFFICIAL (Nemo)
// ==========================================
async function runMistral(history, message) {
    if (!mistralKey || mistralKey === "dummy") throw new Error("API Key Mistral belum dipasang!");

    const messages = [
        { role: "system", content: promptFlora },
        ...getCleanHistory(history),
        { role: "user", content: message }
    ];

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mistralKey}` },
        body: JSON.stringify({
            model: "open-mistral-nemo", // Model gratis & pintar dari Mistral
            messages: messages,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Mistral API Error: ${err.message || response.statusText}`);
    }
    const data = await response.json();
    return cleanResponse(data.choices[0].message.content);
}

// ==========================================
// 3. ENGINE: GEMINI (Backup & Vision)
// ==========================================
function fileToGenerativePart(base64Image) {
    const data = base64Image.split(",")[1];
    const mimeType = base64Image.substring(base64Image.indexOf(":") + 1, base64Image.indexOf(";"));
    return { inlineData: { data, mimeType } };
}

async function runGemini(history, message, imageBase64) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: promptFlora });
    
    if (imageBase64) {
        const imagePart = fileToGenerativePart(imageBase64);
        const result = await model.generateContent([message || "Jelaskan gambar ini", imagePart]);
        return cleanResponse(result.response.text());
    } else {
        const chat = model.startChat({
            history: history.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content.replace(/<[^>]*>/g, '') }]
            }))
        });
        const result = await chat.sendMessage(message);
        return cleanResponse(result.response.text());
    }
}

// ==========================================
// MAIN HANDLER (ROUTER)
// ==========================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image, model } = req.body;
        let result = "";
        let label = "Flora AI";

        // --- 1. JIKA ADA GAMBAR (VISION MODE) ---
        if (image) {
            // Mistral Official tidak bisa lihat gambar, jadi kita pakai Groq Vision atau Gemini
            try {
                console.log("Vision Mode: Menggunakan Groq Llama Vision...");
                result = await runGroq(history, message, image);
                label = "Flora Vision (Llama)";
            } catch (e) {
                console.log("Groq Vision Limit, switch ke Gemini...", e.message);
                result = await runGemini(history, message, image);
                label = "Flora Vision (Gemini)";
            }
        } 
        
        // --- 2. JIKA TEKS BIASA (CHAT MODE) ---
        else {
            // Cek pilihan user di Frontend
            if (model === 'mistral') {
                try {
                    console.log("Mode: Mistral Official");
                    result = await runMistral(history, message);
                    label = "Flora (Mistral Nemo)";
                } catch (e) {
                    console.error("Mistral Gagal, fallback ke Groq...", e.message);
                    result = await runGroq(history, message);
                    label = "Flora (Llama 3.3 - Backup)";
                }
            } 
            else if (model === 'gemini') {
                try {
                    console.log("Mode: Gemini");
                    result = await runGemini(history, message);
                    label = "Flora (Gemini)";
                } catch (e) {
                    result = await runGroq(history, message);
                    label = "Flora (Llama 3.3 - Backup)";
                }
            } 
            else {
                // Default: GROQ (Llama 3.3) karena paling stabil & gratis
                try {
                    console.log("Mode: Default (Groq)");
                    result = await runGroq(history, message);
                    label = "Flora (Llama 3.3)";
                } catch (e) {
                    console.log("Groq Limit, fallback ke Gemini...");
                    result = await runGemini(history, message);
                    label = "Flora (Gemini Backup)";
                }
            }
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        console.error("Server Fatal Error:", err);
        return res.status(500).json({ reply: `Error Sistem: ${err.message}` });
    }
};
