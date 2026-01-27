const { GoogleGenerativeAI } = require("@google/generative-ai");
// Kita pakai 'fetch' bawaan Node.js, tidak butuh groq-sdk untuk jalur ini

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
// Masukkan MISTRAL_API_KEY di Vercel Environment Variables
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

// --- PROMPT FLORA ---
const promptFlora = `
    Nama kamu Flora AI. Kamu asisten cerdas yang menggunakan otak asli Mistral AI.
    Gaya bicara: Santai, logis, dan to the point.
    PENTING: Gunakan HTML <b>tebal</b> dan <br> untuk baris baru.
`;

const cleanResponse = (text) => text ? text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, "<br>").trim() : "";
const getCleanHistory = (history) => history.map(msg => ({
    role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
    content: msg.content.replace(/<[^>]*>/g, '').trim()
}));

// --- 1. EKSEKUTOR MISTRAL OFFICIAL ---
async function runMistral(history, message) {
    const messages = [
        { role: "system", content: promptFlora },
        ...getCleanHistory(history),
        { role: "user", content: message }
    ];

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            model: "open-mistral-nemo", // Model Gratis & Cepat dari Mistral
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

// --- 2. EKSEKUTOR GEMINI (VISION & BACKUP) ---
// Mistral Nemo text-only, jadi kalau ada gambar kita pakai Gemini/Llama Vision
function fileToGenerativePart(base64Image) {
    const data = base64Image.split(",")[1];
    const mimeType = base64Image.substring(base64Image.indexOf(":") + 1, base64Image.indexOf(";"));
    return { inlineData: { data, mimeType } };
}

async function runGemini(history, message, imageBase64 = null) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
    
    if (imageBase64) {
        const imagePart = fileToGenerativePart(imageBase64);
        const result = await model.generateContent([message || "Jelaskan gambar ini", imagePart]);
        return cleanResponse(result.response.text());
    } else {
        // Backup Text Mode
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

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        let result = "";
        let label = "Flora (Mistral Official)";

        if (image) {
            // Mistral Nemo gabisa liat gambar, lempar ke Gemini Vision
            console.log("Ada gambar -> Switch ke Gemini Vision");
            result = await runGemini(history, message, image);
            label = "Flora Vision (Gemini)";
        } else {
            // Chat Teks Pakai Mistral Asli
            try {
                result = await runMistral(history, message);
            } catch (mistralErr) {
                console.error("Mistral Error:", mistralErr.message);
                // Backup ke Gemini kalau Mistral limit/error
                result = await runGemini(history, message);
                label = "Flora Backup (Gemini)";
            }
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        console.error("Server Error:", err);
        return res.status(500).json({ reply: `Error: ${err.message}` });
    }
};
