// Nama File: api/edit.js
const FormData = require('form-data');

const API_BASE = 'https://www.createimg.com?api=v1';

// --- HELPER 1: BYPASS TURNSTILE ---
async function bypassTurnstile() {
    const url = 'https://api.nekolabs.web.id/tools/bypass/cf-turnstile?url=https://www.createimg.com/&siteKey=0x4AAAAAABggkaHPwa2n_WBx';
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error('Gagal bypass Cloudflare Turnstile');
    return data.result;
}

// --- HELPER 2: LOGIC CREATEIMG ---
const CreateImg = {
    generateSecurity: () => Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join(''),

    initialize: async (token, security) => {
        const params = new URLSearchParams({ token, security, action: 'turnstile', module: 'edit' });
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: params
        });
        return await res.json();
    },

    upload: async (imageBuffer, token, security, server) => {
        const form = new FormData();
        form.append('token', token);
        form.append('security', security);
        form.append('action', 'upload');
        form.append('server', server);
        form.append('image', imageBuffer, 'image.jpg');

        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { ...form.getHeaders(), 'User-Agent': 'Mozilla/5.0' },
            body: form
        });
        return await res.json();
    },

    submitTask: async (prompt, filename, token, security, server) => {
        const params = new URLSearchParams({
            token, security, action: 'edit', server,
            prompt, negative: '', seed: Math.floor(Math.random() * 1000000000), size: 1024, // HD Size
            'files[image]': filename
        });

        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: params
        });
        return await res.json();
    },

    checkQueue: async (id, queue, token, security, server) => {
        const params = new URLSearchParams({ id, queue, module: 'edit', action: 'queue', server, token, security });
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: params
        });
        return await res.json();
    },

    getFinalUrl: async (id, token, security, server) => {
        // 1. Get History (Filename)
        const histParams = new URLSearchParams({ id, action: 'history', server, module: 'edit', token, security });
        const histRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: histParams
        });
        const histData = await histRes.json();
        if (!histData.status) throw new Error("Gagal mengambil history");

        // 2. Get Output (URL)
        const outParams = new URLSearchParams({ id: histData.file, action: 'output', server, module: 'edit', token, security, page: 'home', lang: 'en' });
        const outRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: outParams
        });
        const outData = await outRes.json();
        return outData.data; // URL Gambar
    }
};

// --- HANDLER VERCEL ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { step, image, prompt, jobData } = req.body;

        // PINTU 1: START (Upload & Submit)
        if (step === 'start') {
            if (!image || !prompt) return res.status(400).json({ error: "Gambar/Prompt kosong" });

            // 1. Setup Session
            const token = await bypassTurnstile();
            const security = CreateImg.generateSecurity();
            const initData = await CreateImg.initialize(token, security);
            
            if (!initData.status) throw new Error("Gagal inisialisasi server createimg");
            const server = initData.server;

            // 2. Convert Base64 ke Buffer
            const buffer = Buffer.from(image.split(',')[1], 'base64');

            // 3. Upload Gambar
            const uploadRes = await CreateImg.upload(buffer, token, security, server);
            if (!uploadRes.status) throw new Error("Gagal upload gambar");

            // 4. Submit Task Edit
            const taskRes = await CreateImg.submitTask(prompt, uploadRes.filename.image, token, security, server);
            if (!taskRes.status) throw new Error("Gagal memulai edit");

            // 5. Kembalikan Job Data ke Client (Untuk Polling)
            return res.json({
                success: true,
                jobData: {
                    id: taskRes.id,
                    queue: taskRes.queue,
                    server, token, security // Simpan kredensial untuk cek status nanti
                }
            });
        }

        // PINTU 2: CHECK (Cek Antrian)
        else if (step === 'check') {
            const { id, queue, server, token, security } = jobData;

            // 1. Cek Antrian
            const queueRes = await CreateImg.checkQueue(id, queue, token, security, server);
            
            // Masih ngantri
            if (queueRes.pending > 0) {
                return res.json({ status: 'pending', pending: queueRes.pending });
            }

            // Sudah selesai -> Ambil URL
            const finalUrl = await CreateImg.getFinalUrl(id, token, security, server);
            return res.json({ status: 'done', url: finalUrl });
        }

    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, error: e.message });
    }
};
