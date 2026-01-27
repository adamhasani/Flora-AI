const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
// Pastikan GROQ_API_KEY ada di Vercel
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });

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

// --- EKSEKUTOR (PURE GROQ) ---
async function runGroq(history, message, imageBase64) {
    let messages = [
        { role: "system", content: promptFlora },
        ...getCleanHistory(history)
    ];

    // DEFAULT: MISTRAL (Mixtral 8x7b)
    let modelName = "mixtral-8x7b-32768"; 

    if (imageBase64) {
        // PENGECUALIAN: Kalau ada gambar, terpaksa switch ke Llama Vision
        // (Karena Mistral di Groq belum support gambar sama sekali)
        console.log("Ada gambar -> Switch ke Llama Vision (Mistral buta)");
        modelName = "llama-3.2-11b-vision-preview"; 
        
        messages.push({
            role: "user",
            content: [
                { type: "text", text: message || "Jelaskan gambar ini" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
    } else {
        // FULL MISTRAL UNTUK TEKS
        console.log("Mode Teks -> Murni Mistral");
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

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        
        // Langsung panggil Mistral (Groq) tanpa try-catch backup
        const result = await runGroq(history, message, image);
        
        const label = image ? "Flora Vision" : "Flora (Mistral)";

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        // Kalau error, langsung tampilkan error aslinya
        console.error("Mistral Error:", err);
        return res.status(500).json({ 
            reply: `<b>[System Error]</b><br>Mistral gagal merespon: ${err.message}` 
        });
    }
};
