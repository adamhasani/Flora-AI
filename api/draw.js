// Nama File: api/draw.js

// CONFIG DARI KODE KAMU
const CONFIG = {
    FLUX_API: 'https://flux2.cloud/api/web/generate-basic',
    BYPASS_API: 'https://api.nekolabs.web.id/tools/bypass/cf-turnstile',
    SITE_URL: 'https://flux2.cloud',
    SITE_KEY: '0x4AAAAAACBE7FYcn9PdfENx',
    TIMEOUT: 60000, // 60 Detik
    MAX_RETRIES: 3
};

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
    'Content-Type': 'application/json',
    'origin': 'https://flux2.cloud',
    'referer': 'https://flux2.cloud/'
};

// --- HELPER 1: BYPASS TURNSTILE (Sesuai kode kamu) ---
async function bypassTurnstile(retry = 0) {
    console.log(`🔄 Bypass Turnstile (Percobaan ${retry + 1})...`);
    
    try {
        const url = `${CONFIG.BYPASS_API}?url=${encodeURIComponent(CONFIG.SITE_URL)}&siteKey=${CONFIG.SITE_KEY}`;
        const res = await fetch(url, { 
            headers: { 'User-Agent': HEADERS['User-Agent'] },
            // Vercel kadang butuh signal abort untuk timeout manual, tapi fetch default oke
        });

        if (!res.ok) throw new Error(`Bypass HTTP Error: ${res.status}`);
        
        const data = await res.json();
        if (!data.success || !data.result) {
            if (retry < CONFIG.MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 2000)); // Tunggu 2 detik
                return bypassTurnstile(retry + 1);
            }
            throw new Error('Bypass Failed: Token not found');
        }
        return data.result;

    } catch (e) {
        if (retry < CONFIG.MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, 2000));
            return bypassTurnstile(retry + 1);
        }
        throw e;
    }
}

// --- HELPER 2: GENERATE IMAGE ---
async function generateImage(prompt, token, width, height) {
    console.log("🎨 Mengirim request ke Flux2...");
    const res = await fetch(CONFIG.FLUX_API, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ 
            prompt: prompt, 
            turnstile_token: token, 
            width: width, 
            height: height 
        })
    });

    if (!res.ok) throw new Error(`Flux API Error: ${res.status}`);
    const data = await res.json();
    
    if (!data.image_url) throw new Error('Gagal: Flux tidak mengembalikan URL gambar.');
    return data.image_url; // Ini biasanya format base64 (data:image/jpeg;base64,...)
}

// --- HANDLER UTAMA VERCEL ---
module.exports = async (req, res) => {
    // 1. Setup Header CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ success: false, error: "Prompt kosong!" });
        }

        // Default Ukuran (Bisa diatur 256-1024)
        // Kita set 512 atau 1024. 512 lebih cepat, 1024 lebih bagus.
        const width = 1024;
        const height = 1024;

        // 1. Dapatkan Token Bypass
        const token = await bypassTurnstile();
        
        // 2. Generate Gambar
        const imageUrl = await generateImage(prompt, token, width, height);

        // 3. Kirim Result
        // Flux2 mengembalikan Base64 Data URI, jadi kita kirim langsung ke frontend
        // Frontend kita sudah support base64 karena tag <img> bisa membacanya.
        return res.status(200).json({ 
            success: true, 
            url: imageUrl, 
            details: `Flux2 Cloud | ${width}x${height}`
        });

    } catch (error) {
        console.error("Draw Error:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: `Gagal membuat gambar: ${error.message}. (Mungkin API Bypass sedang sibuk)` 
        });
    }
};
