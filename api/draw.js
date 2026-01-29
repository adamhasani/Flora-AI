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

module.exports = async (req, res) => {
    // 1. Setup Header CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });

        // 2. Translate ke Inggris
        const englishPrompt = await translateToEnglish(prompt);
        // Hapus kata-kata aneh, ambil intinya saja
        const cleanPrompt = encodeURIComponent(englishPrompt); 

        // 3. Generate 2 Variasi Gambar Saja (Biar Gak Kena Limit)
        const images = [];
        const count = 2; // TURUNKAN JADI 2
        
        for (let i = 0; i < count; i++) {
            const seed = Math.floor(Math.random() * 1000000) + i;
            
            // GANTI KE 'turbo' SEMUA BIAR AMAN DARI LIMIT
            // Kalau flux sering kena blokir kalau anonim
            const model = 'turbo'; 

            // Kita tambahkan parameter acak di URL biar dianggap request baru
            const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&seed=${seed}&model=${model}&nologo=true&enhance=false`;
            
            images.push(url);
        }

        // 4. Kirim Hasil
        return res.status(200).json({ 
            success: true, 
            images: images,
            type: 'carousel'
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
