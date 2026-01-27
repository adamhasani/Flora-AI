const { GoogleGenerativeAI } = require("@google/generative-ai");

// Pastikan kamu sudah taruh API Key di Vercel (Settings > Environment Variables)
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

module.exports = async (req, res) => {
    // 1. SETUP CORS (Biar Web Frontend bisa akses API ini)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Jika browser cuma "nanya" (Preflight), langsung jawab OK
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Pastikan metode request adalah POST
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Pesan kosong' });

        // 2. PILIH MODEL (Gemini 3 Flash Preview)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", 
            
            // Atur kepribadian bot di sini
            systemInstruction: "Nama kamu Flora. Kamu asisten AI yang cerdas, santai, lucu, dan suka menggunakan emoji. Kamu menjawab dalam Bahasa Indonesia gaul tapi sopan.",
        });

        // 3. KIRIM PESAN KE GOOGLE
        const result = await model.generateContent(message);
        const response = await result.response;
        const text = response.text();

        // 4. KIRIM JAWABAN KE WEB
        return res.status(200).json({ reply: text });

    } catch (error) {
        console.error("Gemini Error:", error);

        // -- PENANGANAN ERROR LIMIT (429) --
        // Karena model "Preview" kuotanya dikit, kita kasih pesan yang jelas kalau habis.
        if (error.message.includes("429") || error.message.includes("quota")) {
            return res.status(200).json({ 
                reply: "⚠️ Waduh, kuota model 'Gemini 3 Preview' habis nih (Limit Google). Coba ganti ke 'gemini-2.0-flash' di file api/index.js biar lebih stabil ya!" 
            });
        }

        return res.status(500).json({ reply: "Maaf, Flora lagi pusing (Error Server). Coba tanya lagi nanti ya." });
    }
};
