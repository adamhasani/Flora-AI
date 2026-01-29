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

// 2. Sumber A: Hercai (Prioritas Utama)
async function tryHercai(prompt) {
    try {
        // Timeout manual 5 detik biar gak nunggu kelamaan
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const url = `https://hercai.onrender.com/v3/text2image?prompt=${encodeURIComponent(prompt)}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        const data = await res.json();
        if (!data.url) throw new Error("Hercai gagal");
        return data.url;
    } catch (e) {
        return null; // Gagal
    }
}

// 3. Sumber B: Pollinations Turbo (Cadangan Mati)
function getPollinations(prompt, seed) {
    const safePrompt = encodeURIComponent(prompt);
    // Pakai model Turbo biar ngebut & jarang limit
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

        // 1. Translate dulu
        const englishPrompt = await translateToEnglish(prompt);
        const finalPrompt = `${englishPrompt}, masterpiece, best quality, ultra detailed`;

        // 2. Siapkan 2 Slot Gambar (Paralel)
        // Kita coba generate 2 gambar sekaligus
        const tasks = [0, 1].map(async (i) => {
            // COBA HERCAI DULU...
            let imageUrl = await tryHercai(finalPrompt);
            
            // KALAU HERCAI GAGAL (NULL), PAKAI POLLINATIONS
            if (!imageUrl) {
                console.log(`Slot ${i}: Hercai sibuk, switch ke Pollinations.`);
                const seed = Math.floor(Math.random() * 1000000) + i;
                imageUrl = getPollinations(finalPrompt, seed);
            }
            
            return imageUrl;
        });

        // Tunggu semua selesai
        const images = await Promise.all(tasks);

        return res.status(200).json({ 
            success: true, 
            images: images,
            type: 'carousel'
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
