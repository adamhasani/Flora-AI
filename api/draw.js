// Nama File: api/draw.js

// Fungsi simpel buat translate ke Inggris pakai Google Translate (Gratis/Public API)
async function translateToEnglish(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        // Ambil hasil terjemahan dari struktur JSON Google
        return data[0][0][0];
    } catch (e) {
        // Kalau gagal translate, pakai teks asli aja
        return text;
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

        // 2. PROSES TRANSLATE (Indo -> Inggris)
        // Ini kuncinya biar "Burung Hantu" jadi "Owl"
        const englishPrompt = await translateToEnglish(prompt);
        
        // Tambahkan bumbu penyedap biar gambarnya HD
        const finalPrompt = `${englishPrompt}, highly detailed, 8k, cinematic lighting, masterpiece`;
        const safePrompt = encodeURIComponent(finalPrompt);

        // 3. Generate 4 Variasi Gambar (Carousel)
        const images = [];
        const count = 4;
        
        for (let i = 0; i < count; i++) {
            const seed = Math.floor(Math.random() * 1000000000) + i;
            
            // Variasi Model:
            // Gambar 1 & 2: Flux (Paling Bagus tapi agak lama muncul)
            // Gambar 3 & 4: Turbo (Cepat muncul)
            const model = i < 2 ? 'flux' : 'turbo';

            const url = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&seed=${seed}&model=${model}&nologo=true`;
            images.push(url);
        }

        // 4. Kirim Hasil
        return res.status(200).json({ 
            success: true, 
            images: images,
            originalPrompt: prompt,
            translatedPrompt: englishPrompt // Kita kirim balik info ini buat debug kalau mau
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
