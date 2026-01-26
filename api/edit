// api/edit.js
const axios = require('axios');
const FormData = require('form-data');

// --- HELPER: NANO BANANA (Engine Pengubah Gambar) ---
async function runNanoBanana(base64Image, prompt) {
    // 1. Ubah Base64 jadi Buffer
    const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
    
    const headers = {
        'User-Agent': 'okhttp/4.9.3',
        'Platform': 'android'
    };

    // 2. Create Job
    const form = new FormData();
    form.append('model_name', 'seedream');
    form.append('edit_type', 'style_transfer');
    form.append('prompt', `${prompt}, high quality`);
    form.append('strength', '0.6');
    form.append('target_images', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

    try {
        const { data: job } = await axios.post('https://api.photoeditorai.io/pe/photo-editor/create-job', form, { 
            headers: { ...form.getHeaders(), ...headers } 
        });

        if (!job.result?.job_id) throw new Error("Gagal membuat antrian.");

        // 3. Polling (Cek status) - Max 5x cek biar gak timeout di Vercel
        const jobId = job.result.job_id;
        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 1000)); // Tunggu 1 detik
            const { data: res } = await axios.get(`https://api.photoeditorai.io/pe/photo-editor/get-job/${jobId}`, { headers });
            
            if (res.result.status === 2 && res.result.output?.length) {
                return res.result.output[0]; // Berhasil!
            }
        }
        throw new Error("Waktu habis (Timeout).");
    } catch (e) {
        throw new Error(e.message);
    }
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    // Izin CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { image, prompt } = req.body;
        if (!image || !prompt) throw new Error("Gambar atau prompt kosong.");

        // Jalankan Engine
        const resultUrl = await runNanoBanana(image, prompt);

        return res.status(200).json({ 
            success: true, 
            url: resultUrl 
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: error.message });
    }
};
