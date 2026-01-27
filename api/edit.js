const axios = require('axios');
const FormData = require('form-data');

// Fungsi Upload ke Pomf (Pengganti Catbox)
async function uploadFile(buffer) {
    const form = new FormData();
    form.append('files[]', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

    try {
        // Kita pakai Pomf (biasanya lolos dari blokir Vercel)
        const { data } = await axios.post('https://pomf.lain.la/upload.php', form, {
            headers: form.getHeaders()
        });
        
        if (data.success && data.files && data.files[0]) {
            return data.files[0].url;
        }
        throw new Error("Gagal upload gambar.");
    } catch (e) {
        throw new Error("Uploader Error: " + e.message);
    }
}

module.exports = async (req, res) => {
    // 1. Standar Header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { image, prompt } = req.body;
        if (!image || !prompt) throw new Error("Gambar/Prompt tidak boleh kosong.");

        // 2. Convert Base64 ke Buffer
        const buffer = Buffer.from(image.split(',')[1], 'base64');

        // 3. Upload dulu biar dapat URL (Syarat Faa)
        const imageUrl = await uploadFile(buffer);
        console.log("URL Gambar:", imageUrl);

        // 4. Panggil Faa Engine
        // Style kita set default biar gampang, atau ikutin prompt
        const faaUrl = `https://api-faa.my.id/faa/editfoto?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;
        
        const response = await axios.get(faaUrl, { 
            responseType: 'arraybuffer',
            timeout: 25000 // Batas waktu 25 detik
        });

        // 5. Ubah hasil jadi Base64 lagi
        const base64Result = Buffer.from(response.data, 'binary').toString('base64');
        const finalData = `data:image/jpeg;base64,${base64Result}`;

        return res.status(200).json({ success: true, url: finalData });

    } catch (error) {
        console.error("Error:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
