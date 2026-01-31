// Nama File: api/draw.js

module.exports = async (req, res) => {
    // 1. Setup Header CORS (Wajib biar bisa diakses dari Frontend)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });

        // 2. Translate (Indo -> Inggris)
        // Kita pakai Google Translate API yang ringan & gratis biar Pollinations paham
        let englishPrompt = prompt;
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(prompt)}`;
            const response = await fetch(url);
            const data = await response.json();
            if(data && data[0] && data[0][0] && data[0][0][0]) {
                englishPrompt = data[0][0][0];
            }
        } catch (e) {
            console.log("Translate error (skip):", e.message);
        }

        // 3. Racik 4 URL Gambar (Link Factory)
        // Kita tidak download gambar di sini, cuma bikin string URL-nya.
        // Gambar akan diload oleh HP user, jadi IP Vercel AMAN dari limit.
        
        const cleanPrompt = englishPrompt.replace(/[^\w\s,]/gi, ''); // Hapus simbol aneh
        const finalPrompt = encodeURIComponent(cleanPrompt);
        const seed = Math.floor(Math.random() * 1000000);

        // Kita siapkan 4 Model berbeda untuk variasi maksimal (Carousel)
        const images = [
            `https://image.pollinations.ai/prompt/${finalPrompt}?width=1024&height=1024&seed=${seed}&model=turbo&nologo=true`,
            `https://image.pollinations.ai/prompt/${finalPrompt}?width=1024&height=1024&seed=${seed+1}&model=flux&nologo=true`,
            `https://image.pollinations.ai/prompt/${finalPrompt}?width=1024&height=1024&seed=${seed+2}&model=flux-realism&nologo=true`,
            `https://image.pollinations.ai/prompt/${finalPrompt}?width=1024&height=1024&seed=${seed+3}&model=any-dark&nologo=true`
        ];

        // 4. Kirim Array Link ke Frontend
        return res.status(200).json({ 
            success: true, 
            images: images,
            translatedPrompt: englishPrompt
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
