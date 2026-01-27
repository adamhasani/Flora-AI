const axios = require('axios');
const FormData = require('form-data');

// Generator ID Palsu (Biar dikira HP beneran)
function generateRandomId(length = 16) {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

const COMMON_HEADERS = {
    'User-Agent': 'okhttp/4.9.3', // Menyamar jadi aplikasi Android
    'Platform': 'android',
    'App-Version': '2.8.3',
    'Accept-Language': 'en-US'
};

module.exports = async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { step, image, prompt, jobId } = req.body;
        
        // PINTU 1: MULAI JOB (Daftar Antrian)
        if (step === 'start') {
            const buffer = Buffer.from(image.split(',')[1], 'base64');
            const form = new FormData();
            
            // Kita pakai model 'anime' (lebih ringan dari seedream)
            form.append('model_name', 'anime'); 
            form.append('edit_type', 'style_transfer');
            form.append('prompt', `${prompt}, masterpiece, best quality, ultra detailed`);
            form.append('strength', '0.65');
            form.append('target_images', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

            // Request ke Server AI
            const { data } = await axios.post('https://api.photoeditorai.io/pe/photo-editor/create-job', form, { 
                headers: { 
                    ...form.getHeaders(), 
                    ...COMMON_HEADERS, 
                    'Product-Serial': generateRandomId() 
                } 
            });

            if (!data.result?.job_id) throw new Error("Server AI sedang penuh. Coba 1 menit lagi.");
            
            return res.status(200).json({ success: true, jobId: data.result.job_id });
        }

        // PINTU 2: CEK STATUS (Tanya "Udah jadi belum?")
        else if (step === 'check') {
            const { data } = await axios.get(`https://api.photoeditorai.io/pe/photo-editor/get-job/${jobId}`, { 
                headers: { ...COMMON_HEADERS } 
            });

            // Status 2 = Selesai
            if (data.result.status === 2 && data.result.output?.length) {
                return res.status(200).json({ status: 'done', url: data.result.output[0] });
            }
            // Status 3 = Gagal (NSFW/Error)
            else if (data.result.status === 3) {
                return res.status(200).json({ status: 'failed', error: "Gambar ditolak (NSFW/Error System)." });
            }
            // Status 0/1 = Masih Loading
            else {
                return res.status(200).json({ status: 'pending' });
            }
        }

    } catch (error) {
        console.error("Error Backend:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
