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

// 2. Sumber A: Hercai (High Quality)
async function getHercaiImage(prompt) {
    try {
        // Timeout 8 detik biar gak lama
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const url = `https://hercai.onrender.com/v3/text2image?prompt=${encodeURIComponent(prompt)}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        const data = await res.json();
        return data.url || null;
    } catch (e) {
        console.log("Hercai Error:", e.message);
        return null;
    }
}

// 3. Sumber B: Pollinations (Mode Turbo - Anti Limit)
// Kita pakai 'Turbo' karena 'Flux' terlalu berat dan sering kena blokir
function getPollinationsImage(prompt) {
    const seed = Math.floor(Math.random() * 1000000);
    const safePrompt = encodeURIComponent(prompt);
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

        // 1. Translate
        const englishPrompt = await translateToEnglish(prompt);
        const finalPrompt = `${englishPrompt}, masterpiece, best quality, ultra detailed, 8k`;

        // 2. PARALEL REQUEST (Minta ke 2 Server Berbeda)
        // - Gambar 1: Dari Hercai
        // - Gambar 2: Dari Pollinations Turbo
        
        const task1 = getHercaiImage(finalPrompt);
        const task2 = Promise.resolve(getPollinationsImage(finalPrompt)); // Pollinations itu instant link

        const results = await Promise.all([task1, task2]);

        // 3. Bersihkan hasil yang gagal (Null)
        const validImages = results.filter(url => url !== null && url.startsWith('http'));

        if (validImages.length === 0) {
            throw new Error("Semua server gambar sibuk. Coba lagi nanti.");
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
