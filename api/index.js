const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

// --- PROMPT FLORA ---
const promptFlora = `
    Nama kamu Flora AI. Kamu asisten cerdas yang menggunakan otak Mistral.
    Gaya bicara: Santai, logis, dan to the point.
    PENTING: Gunakan HTML <b>tebal</b> dan <br> untuk baris baru.
`;

const cleanResponse = (text) => text ? text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, "<br>").trim() : "";
const getCleanHistory = (history) => history.map(msg => ({
    role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
    content: msg.content.replace(/<[^>]*>/g, '').trim()
}));

// --- EKSEKUTOR UTAMA (GROQ) ---
async function runGroq(history, message, imageBase64) {
    let messages = [
        { role: "system", content: promptFlora },
        ...getCleanHistory(history)
    ];

    let modelName = "mixtral-8x7b-32768"; // <--- INI MISTRAL (Default)

    if (imageBase64) {
        // Kalau ada gambar, Mistral gabisa liat, jadi pinjem mata Llama Vision
        console.log("Mode Gambar: Switch ke Llama Vision");
        modelName = "llama-3.2-11b-vision-preview"; 
        
        messages.push({
            role: "user",
            content: [
                { type: "text", text: message || "Jelaskan gambar ini" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
    } else {
        // Kalau Chat Teks Biasa -> PAKE MISTRAL
        console.log("Mode Teks: Full Mistral");
        messages.push({ role: "user", content: message });
    }

    const res = await groq.chat.completions.create({
        messages: messages,
        model: modelName,
        temperature: 0.7,
        max_tokens: 2048,
    });
    return cleanResponse(res.choices[0]?.message?.content);
}

// --- BACKUP DARURAT (GEMINI) ---
// Cuma dipake kalau Groq/Mistral servernya down total
async function runGemini(history, message) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
    const chat = model.startChat({
        history: history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content.replace(/<[^>]*>/g, '') }]
        }))
    });
    const result = await chat.sendMessage(message);
    return cleanResponse(result.response.text());
}

// --- HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        let result = "";
        let label = "Flora (Mistral)";

        try {
            // PAKSA PAKAI GROQ (MISTRAL)
            result = await runGroq(history, message, image);
            if (image) label = "Flora Vision"; 
        } 
        catch (e) {
            console.error("Mistral Error:", e.message);
            // Backup ke Gemini kalau Mistral tewas
            result = await runGemini(history, message);
            label = "Flora (Backup)";
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        return res.status(500).json({ reply: `Error: ${err.message}` });
    }
};
