// Nama File: api/draw.js

module.exports = async (req, res) => {
    // 1. Setup Header (Wajib biar gak kena CORS Block di Vercel)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle Preflight Request
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt gambar tidak boleh kosong!" });
        }

        // 2. Logic Generate Gambar
        // Kita pakai trik Random Seed biar gambarnya selalu fresh (unik)
        const seed = Math.floor(Math.random() * 1000000);
        
        // Encode prompt biar aman di URL (misal spasi jadi %20)
        const safePrompt = encodeURIComponent(prompt);

        // URL Pollinations dengan Model FLUX (Paling canggih saat ini)
        // Parameter:
        // - width/height: 1024 (Square HD)
        // - model: flux (Realistis)
        // - seed: angka acak (biar unik)
        // - nologo: biar bersih gak ada watermark
        const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;

        // 3. Kirim URL ke Frontend
        // Note: Pollinations itu instan, jadi kita cukup kirim URL-nya, 
        // nanti browser yang akan me-load gambarnya.
        return res.status(200).json({ 
            success: true, 
            url: imageUrl,
            details: `Prompt: ${prompt} | Seed: ${seed}`
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: "Gagal memproses gambar. Server lagi sibuk." 
        });
    }
};
