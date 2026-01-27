const axios = require('axios');
const FormData = require('form-data');

// --- HELPER: UPLOAD KE CATBOX (Biar dapat URL) ---
async function uploadToCatbox(buffer) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('time', '1h'); // Hapus otomatis setelah 1 jam
    form.append('fileToUpload', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

    try {
        const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders()
        });
        if (data && data.startsWith('http')) return data.trim();
        throw new Error("Gagal upload ke Catbox");
    } catch (e) {
        throw new Error("Catbox Error: " + e.message);
    }
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    // 1. Setting Header (Biar browser gak rewel)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { image, prompt } = req.body;
        if (!image || !prompt) throw new Error("Gambar/Prompt kosong.");

        // 2. Convert Base64 (dari HP) jadi Buffer (Data Mentah)
        const buffer = Buffer.from(image.split(',')[1], 'base64');

        // 3. Upload dulu ke Catbox buat dapat URL
        // (Karena Faa Engine cuma mau nerima URL)
        const imageUrl = await uploadToCatbox(buffer);
        console.log("Uploaded URL:", imageUrl);

        // 4. Panggil Faa API
        const faaUrl = `https://api-faa.my.id/faa/editfoto?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;
        
        const response = await axios.get(faaUrl, { 
            responseType: 'arraybuffer' // Kita minta data gambar mentah
        });

        // 5. Convert hasil gambar jadi Base64 biar bisa tampil di web
        const base64Result = Buffer.from(response.data, 'binary').toString('base64');
        const finalData = `data:image/jpeg;base64,${base64Result}`;

        return res.status(200).json({ 
            success: true, 
            url: finalData 
        });

    } catch (error) {
        console.error("Error Faa:", error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message || "Gagal memproses gambar." 
        });
    }
};
