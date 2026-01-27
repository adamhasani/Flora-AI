const axios = require('axios');
const FormData = require('form-data');

function generateRandomId(length = 16) {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

const COMMON_HEADERS = {
    'User-Agent': 'okhttp/4.9.3',
    'Platform': 'android',
    'App-Version': '2.9.2', // Update versi biar dipercaya server
    'Accept-Language': 'en-US'
};

module.exports = async (req, res) => {
    // 1. Standar Header Vercel
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { step, image, prompt, jobId } = req.body;
        
        // === PINTU 1: MULAI JOB (DAFTAR ANTRIAN) ===
        if (step === 'start') {
            // Ubah Base64 jadi Buffer (File Mentah)
            const buffer = Buffer.from(image.split(',')[1], 'base64');
            const form = new FormData();
            
            // Settingan Paling Stabil (Jangan diubah biar ga error 422)
            form.append('model_name', 'seedream'); 
            form.append('edit_type', 'style_transfer');
            form.append('prompt', `${prompt}, masterpiece, best quality`);
            form.append('strength', '0.6'); 
            form.append('target_images', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

            // Kirim ke NanoBanana (Langsung, tanpa Pomf/Catbox)
            const { data } = await axios.post('https://api.photoeditorai.io/pe/photo-editor/create-job', form, { 
                headers: { 
                    ...form.getHeaders(), 
                    ...COMMON_HEADERS, 
                    'Product-Serial': generateRandomId() 
                } 
            });

            if (!data.result?.job_id) throw new Error("Server AI sibuk. Coba 1 menit lagi.");
            return res.status(200).json({ success: true, jobId: data.result.job_id });
        }

        // === PINTU 2: CEK STATUS (POLLING) ===
        else if (step === 'check') {
            const { data } = await axios.get(`https://api.photoeditorai.io/pe/photo-editor/get-job/${jobId}`, { 
                headers: { ...COMMON_HEADERS } 
            });

            if (data.result.status === 2 && data.result.output?.length) {
                return res.status(200).json({ status: 'done', url: data.result.output[0] });
            }
            else if (data.result.status === 3) {
                return res.status(200).json({ status: 'failed', error: "Gambar ditolak (NSFW/Error)." });
            }
            else {
                return res.status(200).json({ status: 'pending' }); // Masih loading
            }
        }

    } catch (error) {
        console.error("Error API:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
