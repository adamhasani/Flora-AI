// Nama File: api/edit.js
const FormData = require('form-data');

const API_BASE = 'https://www.createimg.com?api=v1';

// --- HELPER 1: BYPASS TURNSTILE ---
async function bypassTurnstile() {
    try {
        const url = 'https://api.nekolabs.web.id/tools/bypass/cf-turnstile?url=https://www.createimg.com/&siteKey=0x4AAAAAABggkaHPwa2n_WBx';
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) throw new Error('Gagal bypass Cloudflare Turnstile');
        return data.result;
    } catch (e) {
        throw new Error("Server Bypass Nekolabs Down. Coba lagi nanti.");
    }
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
            prompt, negative: '', seed: Math.floor(Math.random() * 1000000000), size: 1024,
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
        const histParams = new URLSearchParams({ id, action: 'history', server, module: 'edit', token, security });
        const histRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: histParams
        });
        const histData = await histRes.json();
        if (!histData.status) throw new Error("Gagal mengambil history file.");

        const outParams = new URLSearchParams({ id: histData.file, action: 'output', server, module: 'edit', token, security, page: 'home', lang: 'en' });
        const outRes = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
            body: outParams
        });
        const outData = await outRes.json();
        return outData.data;
    }
};

// --- HANDLER VERCEL (DENGAN FIX BODY PARSER) ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // [FIX UTAMA] Pastikan body dibaca sebagai JSON
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }

        const { step, image, prompt, jobData } = body || {};

        // Debugging di Vercel Logs (Cek tab Logs kalau error lagi)
        // console.log("Request Step:", step, "Prompt:", prompt ? "Ada" : "Kosong");

        // PINTU 1: START
        if (step === 'start') {
            if (!image) return res.status(400).json({ error: "Gambar belum diupload/dipilih!" });
            if (!prompt) return res.status(400).json({ error: "Prompt kosong! Harap tulis instruksi." });

            // 1. Setup Session
            const token = await bypassTurnstile();
            const security = CreateImg.generateSecurity();
            const initData = await CreateImg.initialize(token, security);
            if (!initData.status) throw new Error("Gagal inisialisasi server CreateImg.");
            const server = initData.server;

            // 2. Upload
            const buffer = Buffer.from(image.split(',')[1], 'base64');
            const uploadRes = await CreateImg.upload(buffer, token, security, server);
            if (!uploadRes.status) throw new Error("Gagal upload gambar ke server.");

            // 3. Submit
            const taskRes = await CreateImg.submitTask(prompt, uploadRes.filename.image, token, security, server);
            if (!taskRes.status) throw new Error("Gagal submit task edit.");

            return res.json({
                success: true,
                jobData: { id: taskRes.id, queue: taskRes.queue, server, token, security }
            });
        }

        // PINTU 2: CHECK
        else if (step === 'check') {
            if (!jobData) return res.status(400).json({ error: "Data Job hilang." });
            const { id, queue, server, token, security } = jobData;

            const queueRes = await CreateImg.checkQueue(id, queue, token, security, server);
            
            if (queueRes.pending > 0) {
                return res.json({ status: 'pending', pending: queueRes.pending });
            }

            const finalUrl = await CreateImg.getFinalUrl(id, token, security, server);
            return res.json({ status: 'done', url: finalUrl });
        }

    } catch (e) {
        console.error("API Edit Error:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
};
