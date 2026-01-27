const Groq = require("groq-sdk");

// Inisialisasi Groq pakai kunci yang di Vercel tadi
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
    // 1. Setting Header (Standar Wajib)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Pesan kosong' });

        // 2. Setting Otak (System Prompt)
        const systemPrompt = "Nama kamu Flora. Kamu asisten AI yang cerdas, santai, lucu, dan suka pakai emoji. Jawablah menggunakan Bahasa Indonesia gaul tapi tetap sopan.";

        // 3. Kirim ke Groq (Llama 3)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
            // Model Llama 3.3 (Paling Update & Cerdas di Tier Gratis)
            model: "llama-3.3-70b-versatile",
            
            // Settingan tambahan biar jawabnya pas
            temperature: 0.7,
            max_tokens: 1024,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Maaf, Flora lagi ngelamun.";

        return res.status(200).json({ reply: reply });

    } catch (error) {
        console.error("Groq Error:", error);
        return res.status(200).json({ 
            reply: `⚠️ Error Sistem: ${error.message}` 
        });
    }
};
