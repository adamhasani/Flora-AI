const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

module.exports = async (req, res) => {
    // Header Wajib
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. CEK KUNCI RAHASIA (ENV VARS)
    const statusKeys = {
        Gemini_Key: process.env.API_KEY ? "✅ Ada" : "❌ KOSONG (Wajib isi API_KEY)",
        Groq_Key: process.env.GROQ_API_KEY ? "✅ Ada" : "❌ KOSONG (Wajib isi GROQ_API_KEY)",
        Tavily_Key: process.env.TAVILY_API_KEY ? "✅ Ada" : "⚠️ Kosong (Gapapa)",
        Node_Version: process.version
    };

    try {
        const { history } = req.body;
        if (!history) return res.status(400).json({ reply: "History tidak ditemukan." });

        // JIKA KUNCI KOSONG, LANGSUNG LAPOR
        if (!process.env.API_KEY && !process.env.GROQ_API_KEY) {
            return res.json({ 
                reply: `<b>🛑 ERROR KONFIGURASI</b><br>` +
                       `Bot tidak bisa jalan karena kunci belum disetting di Vercel:<br>` +
                       `<ul>` +
                       `<li>API_KEY (Gemini): ${statusKeys.Gemini_Key}</li>` +
                       `<li>GROQ_API_KEY: ${statusKeys.Groq_Key}</li>` +
                       `</ul><br>` +
                       `Silakan buka Vercel > Settings > Environment Variables.`
            });
        }

        // 2. TES KONEKSI GROQ (Percobaan Pertama)
        let errorLog = "";
        try {
            const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: "Tes koneksi. Jawab singkat 'Halo'." }],
                model: "mixtral-8x7b-32768",
            });
            return res.json({ reply: `<b>✅ SUKSES! Groq Berhasil Konek.</b><br>Balasan: ${chatCompletion.choices[0]?.message?.content}` });
        } catch (errGroq) {
            errorLog += `<b>Groq Error:</b> ${errGroq.message}<br>`;
        }

        // 3. TES KONEKSI ANABOT (Jika Groq Gagal)
        try {
            const url = `https://anabot.my.id/api/ai/geminiOption?prompt=Halo&type=Chat&apikey=freeApikey`;
            const resp = await fetch(url);
            const data = await resp.json();
            return res.json({ reply: `<b>✅ Anabot Hidup!</b><br>Tapi Groq mati.<br><br>Log Error:<br>${errorLog}` });
        } catch (errAnabot) {
            errorLog += `<b>Anabot Error:</b> ${errAnabot.message}<br>`;
        }

        // JIKA SEMUA GAGAL
        return res.json({ 
            reply: `<b>☠️ SEMUA SERVER MATI</b><br>` +
                   `Versi Node: ${statusKeys.Node_Version}<br>` +
                   `Status Key: Gemini (${statusKeys.Gemini_Key}), Groq (${statusKeys.Groq_Key})<br><br>` +
                   `<b>Detail Error:</b><br>${errorLog}` 
        });

    } catch (err) {
        return res.status(500).json({ reply: `System Crash: ${err.message}` });
    }
};
