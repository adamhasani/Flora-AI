// Nama File: api/draw.js

// Fungsi Translate (Indo -> Inggris)
async function translateToEnglish(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data[0][0][0];
    } catch (e) {
        return text;
    }
}

// Fungsi Request ke Hercai
async function generateHercai(prompt) {
    try {
        // Hercai API v3 (Model paling bagus)
        const url = `https://hercai.onrender.com/v3/text2image?prompt=${encodeURIComponent(prompt)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.url; // Mengembalikan URL gambar
    } catch (e) {
        return null;
    }
}

module.exports = async (req, res) => {
    // 1. Setup Header CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });

        // 2. Translate ke Inggris biar akurat
        const englishPrompt = await translateToEnglish(prompt);
        const cleanPrompt = `${englishPrompt}, highly detailed, 8k, masterpiece`;

        // 3. GENERATE GAMBAR (Hercai)
        // Kita minta 2 gambar secara PARALEL (Bersamaan) biar cepat
        // Kalau satu per satu nanti keburu timeout Vercel-nya.
        
        const promises = [
            generateHercai(cleanPrompt),
            generateHercai(cleanPrompt + ", cinematic shot") // Variasi dikit
        ];

        // Tunggu keduanya selesai
        const results = await Promise.all(promises);
        
        // Filter kalau ada yang gagal (null)
        const validImages = results.filter(url => url !== null);

        if (validImages.length === 0) {
            throw new Error("Gagal generate gambar (Server Hercai sibuk).");
        }

        // 4. Kirim Hasil
        return res.status(200).json({ 
            success: true, 
            images: validImages,
            type: 'carousel'
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
