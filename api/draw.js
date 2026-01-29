// Nama File: api/draw.js

// 1. Fungsi Translate (Indo -> Inggris)
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

// 2. Fungsi Utama: Request ke Anabot
async function getAnabotImage(prompt) {
    try {
        // Timeout 25 detik (Kita kasih waktu agak lama biar Anabot sempat mikir)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const model = 'Photo Realistic'; 
        const apikey = 'freeApikey';
        
        const url = `https://anabot.my.id/api/ai/dreamImage?prompt=${encodeURIComponent(prompt)}&models=${encodeURIComponent(model)}&apikey=${apikey}`;
        
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        
        const data = await res.json();
        
        // Cek URL hasil
        const imageUrl = data.url || data.result;

        if (!imageUrl || typeof imageUrl !== 'string') {
            throw new Error("Respon Anabot kosong");
        }

        return imageUrl;

    } catch (e) {
        console.log("Anabot Error:", e.message);
        return null; 
    }
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    // Setup CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });

        // 1. Translate
        const englishPrompt = await translateToEnglish(prompt);
        const finalPrompt = `${englishPrompt}, hyper realistic, 8k, cinematic lighting`;

        // 2. Request ke Anabot (2x Paralel biar tetap Carousel)
        // Kita paksa dua-duanya minta ke Anabot
        const task1 = getAnabotImage(finalPrompt);
        const task2 = getAnabotImage(finalPrompt + ", different angle"); 

        const results = await Promise.all([task1, task2]);

        // 3. Cek Hasil
        const validImages = results.filter(url => url !== null);

        // Kalau kosong, berarti Anabot gagal total
        if (validImages.length === 0) {
            throw new Error("Server Anabot tidak merespon. Coba lagi nanti.");
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
