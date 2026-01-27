const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Kita terima 'history' (array), bukan cuma 'message'
        const { history } = req.body;
        if (!history || !Array.isArray(history)) {
            return res.status(400).json({ error: 'Riwayat chat tidak valid' });
        }

        // --- SISTEM PROMPT (KEPRIBADIAN) ---
        // Ini tetap ditaruh paling atas biar dia ingat siapa dirinya
        const systemPrompt = {
            role: "system",
            content: `Nama kamu Flora. Asisten AI yang cerdas, to-the-point, dan rapi.
            
            ATURAN FORMATTING:
            1. Gunakan HTML Tags: <b>Tebal</b> untuk judul/poin penting. <br> untuk baris baru.
            2. Gunakan <ul><li>Poin 1</li></ul> untuk daftar.
            3. Jangan pakai Markdown (* atau #).
            4. Selalu ingat konteks percakapan sebelumnya.`
        };

        // Gabungkan: [Kepribadian] + [Riwayat Chat User]
        const finalMessages = [systemPrompt, ...history];

        // Kirim semua ke Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: finalMessages,
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
            max_tokens: 1024,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Maaf, error.";

        return res.status(200).json({ reply: reply });

    } catch (error) {
        return res.status(200).json({ reply: `⚠️ Error: ${error.message}` });
    }
};
