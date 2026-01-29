// Nama File: api/draw.js

module.exports = async (req, res) => {
    // Setup Header CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });

        // 1. Fungsi Translate (Google Translate API Gratis)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(prompt)}`;
        const response = await fetch(url);
        const data = await response.json();
        const englishPrompt = data[0][0][0];

        // 2. Kirim balik teks Inggrisnya ke Frontend
        // Kita TIDAK generate gambar di sini biar IP Vercel aman.
        return res.status(200).json({ 
            success: true, 
            translated: englishPrompt
        });

    } catch (error) {
        // Kalau translate gagal, pakai prompt asli aja
        return res.status(200).json({ success: true, translated: req.body.prompt });
    }
};
