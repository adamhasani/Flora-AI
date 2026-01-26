const axios = require('axios');
const FormData = require('form-data');

// --- HELPER 1: GENERATOR ID (Biar dikira HP Asli) ---
function generateRandomId(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// --- HELPER 2: ENGINE NANOBANANA ---
async function runNanoBanana(base64Image, prompt) {
    // 1. Convert Base64 ke Buffer
    const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
    
    // 2. HEADERS LENGKAP (Wajib ada biar gak ditolak)
    const spoofHeaders = {
        'User-Agent': 'okhttp/4.9.3',
        'Platform': 'android',
        'Product-Code': '067005', // Kode rahasia aplikasi
        'Product-Serial': generateRandomId(15), // Serial number palsu
        'Accept-Language': 'en-US'
    };

    // 3. Siapkan Form Data
    const form = new FormData();
    form.append('model_name', 'seedream'); // Model: seedream / anime
    form.append('edit_type', 'style_transfer');
    form.append('prompt', `${prompt}, masterpiece, best quality`);
    form.append('strength', '0.6'); // Seberapa kuat editnya (0.1 - 1.0)
    form.append('target_images', buffer, { 
        filename: 'image.jpg', 
        contentType: 'image/jpeg' 
    });

    try {
        // REQUEST 1: BIKIN JOB
        const { data: job } = await axios.post('https://api.photoeditorai.io/pe/photo-editor/create-job', form, { 
            headers: { 
                ...form.getHeaders(), 
                ...spoofHeaders 
            } 
        });

        if (!job.result?.job_id) {
            console.log("Respon Server:", JSON.stringify(job)); // Cek log jika gagal
            throw new Error("Server menolak request (Job ID null).");
        }

        const jobId = job.result.job_id;

        // REQUEST 2: CEK STATUS (Polling)
        // Kita cek max 10 kali (setiap 1.5 detik)
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1500)); // Tunggu 1.5 detik
            
            const { data: res } = await axios.get(`https://api.photoeditorai.io/pe/photo-editor/get-job/${jobId}`, { 
                headers: spoofHeaders 
            });
            
            // Status 2 = Selesai
            if (res.result.status === 2 && res.result.output?.length) {
                return res.result.output[0]; 
            }
            // Status 3 = Gagal / NSFW
            if (res.result.status === 3) {
                throw new Error("Gambar mengandung konten sensitif/NSFW.");
            }
        }
        throw new Error("Waktu habis (Timeout), coba lagi.");

    } catch (e) {
        throw new Error(e.message || "Gagal menghubungi server AI.");
    }
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { image, prompt } = req.body;
        if (!image || !prompt) throw new Error("Data gambar/prompt kosong.");

        // Jalankan fungsi
        const resultUrl = await runNanoBanana(image, prompt);

        return res.status(200).json({ 
            success: true, 
            url: resultUrl 
        });

    } catch (error) {
        console.error("Error Edit Foto:", error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};
