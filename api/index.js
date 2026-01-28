const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

// --- PROMPT FLORA ---
const promptFlora = `
    Nama kamu Flora AI. Kamu asisten cerdas yang asik.
    Gaya bicara: Santai, informatif, dan membantu.
    PENTING: Gunakan HTML <b>tebal</b> dan <br> untuk baris baru.
`;

const cleanResponse = (text) => text ? text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, "<br>").trim() : "";
const getCleanHistory = (history) => history.map(msg => ({
    role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
    content: msg.content.replace(/<[^>]*>/g, '').trim()
}));

// --- 1. GROQ (VISION & TEKS - PRIORITAS UTAMA) ---
async function runGroq(history, message, imageBase64) {
    if (!groqKey || groqKey === "dummy") throw new Error("API Key Groq Belum Dipasang!");

    let messages = [{ role: "system", content: promptFlora }, ...getCleanHistory(history)];
    
    if (imageBase64) {
        // Mode Vision (Llama 3.2 - Gratis & Cepat)
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
        // Mode Teks (Llama 3.3)
        messages.push({ role: "user", content: message });
        const res = await groq.chat.completions.create({
            messages, model: "llama-3.3-70b-versatile", temperature: 0.7, max_tokens: 2048
        });
        return cleanResponse(res.choices[0]?.message?.content);
    }
}

// --- 2. GEMINI (BACKUP STABIL) ---
function fileToGenerativePart(base64Image) {
    const data = base64Image.split(",")[1];
    const mimeType = base64Image.substring(base64Image.indexOf(":") + 1, base64Image.indexOf(";"));
    return { inlineData: { data, mimeType } };
}

async function runGemini(history, message, imageBase64) {
    // Model ini AMAN dan BELUM KADALUARSA. 
    // Syarat: Library @google/generative-ai harus versi TERBARU.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
    
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

// --- 3. MISTRAL OFFICIAL ---
async function runMistral(history, message) {
    if (!mistralKey || mistralKey === "dummy") throw new Error("API Key Mistral Kosong!");
    const messages = [{ role: "system", content: promptFlora }, ...getCleanHistory(history), { role: "user", content: message }];
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${mistralKey}` },
        body: JSON.stringify({ model: "open-mistral-nemo", messages, temperature: 0.7 })
    });
    if (!response.ok) throw new Error("Mistral Error");
    const data = await response.json();
    return cleanResponse(data.choices[0].message.content);
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image, model } = req.body;
        let result = "", label = "";

        // === JALUR VISION (GAMBAR) ===
        if (image) {
            try {
                // COBA GROQ DULU (GRATIS & CEPAT)
                console.log("Vision: Mencoba Groq...");
                result = await runGroq(history, message, image);
                label = "Flora Vision (Llama)";
            } catch (groqErr) {
                console.error("Groq Gagal:", groqErr.message);
                // BARU LEMPAR KE GEMINI 1.5 FLASH
                try {
                    console.log("Vision: Switch ke Gemini 1.5...");
                    result = await runGemini(history, message, image);
                    label = "Flora Vision (Gemini)";
                } catch (geminiErr) {
                    throw new Error("Semua Vision AI sibuk. Coba 1 menit lagi.");
                }
            }
        } 
        // === JALUR CHAT TEKS ===
        else {
            if (model === 'mistral') {
                try {
                    result = await runMistral(history, message);
                    label = "Flora (Mistral Official)";
                } catch(e) {
                    result = await runGroq(history, message);
                    label = "Flora (Llama Backup)";
                }
            } else {
                // Default: Groq Llama 3.3
                try {
                    result = await runGroq(history, message);
                    label = "Flora (Llama 3.3)";
                } catch(e) {
                    result = await runGemini(history, message);
                    label = "Flora (Gemini Backup)";
                }
            }
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        console.error("Server Error:", err);
        return res.status(500).json({ reply: `Error Sistem: ${err.message}` });
    }
};
