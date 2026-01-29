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

// 2. Sumber A: Anabot (Model: Photo Realistic)
async function getAnabotImage(prompt) {
    try {
        // Timeout 20 detik (Anabot kadang butuh waktu render HD)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        // MODEL DIGANTI JADI 'Photo Realistic'
        const model = 'Photo Realistic'; 
        const apikey = 'freeApikey';

        const url = `https://anabot.my.id/api/ai/dreamImage?prompt=${encodeURIComponent(prompt)}&models=${encodeURIComponent(model)}&apikey=${apikey}`;
        
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        
        const data = await res.json();
        
        // Ambil URL dari respons JSON
        return data.url || data.result || null;

    } catch (e) {
        console.log("Anabot Error:", e.message);
        return null;
    }
}

// 3. Sumber B: Pollinations (Mode Turbo - Cadangan Cepat)
function getPollinationsImage(prompt) {
    const seed = Math.floor(Math.random() * 1000000);
    const safePrompt = encodeURIComponent(prompt);
    // Pollinations Turbo selalu jadi back-up yang handal
    return `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&seed=${seed}&model=turbo&nologo=true`;
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });

        // 1. Translate & Enhance Prompt
        const englishPrompt = await translateToEnglish(prompt);
        // Tambahan keyword agar hasil Photo Realistic makin maksimal
        const finalPrompt = `${englishPrompt}, hyper realistic, 8k, cinematic lighting, photography`;

        // 2. PARALEL REQUEST (Anabot + Pollinations)
        const task1 = getAnabotImage(finalPrompt);
        const task2 = Promise.resolve(getPollinationsImage(finalPrompt)); 

        const results = await Promise.all([task1, task2]);

        // 3. Filter hasil yang valid (URL http...)
        const validImages = results.filter(url => url !== null && typeof url === 'string' && url.startsWith('http'));

        if (validImages.length === 0) {
            throw new Error("Semua server gambar sibuk. Coba lagi nanti.");
        }

        // 4. Kirim Hasil Carousel
        return res.status(200).json({ 
            success: true, 
            images: validImages,
            type: 'carousel'
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
