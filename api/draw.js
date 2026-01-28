// Nama File: api/draw.js
const crypto = require('crypto');

// --- KONFIGURASI MODEL DREAMFACE ---
const MODELS = {
    "1": { // Seedream 4.5 (Paling Bagus)
        name: "Seedream 4.5",
        param: { model: "see-dream-45", template_id: "WEB-SEE_DREAM_45", releation_id: "ri05016", play_types: ["SEE_DREAM_45", "TEXT_TO_IMAGE"], output: { count: 1, width: 2560, height: 1920 } }
    }
};

const BASE = 'https://tools.dreamfaceapp.com/dw-server';
const HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
    'origin': 'https://tools.dreamfaceapp.com',
    'referer': 'https://tools.dreamfaceapp.com/'
};

// Helper Random String
const rnd = (n) => crypto.randomBytes(n).toString('hex');

// Helper Fetch Wrapper
async function post(url, body, token, clientId) {
    const headers = { ...HEADERS };
    if (token) headers['token'] = token;
    if (clientId) headers['client-id'] = clientId;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await res.json();
    if (j.status_code !== 'THS12140000000') throw new Error(j.status_msg || 'API DreamFace Error');
    return j.data;
}

// --- LOGIC 1: MULAI JOB (Login & Submit Task) ---
async function startJob(prompt) {
    const modelConfig = MODELS["1"]; // Default Seedream 4.5

    // Buat Identitas Palsu
    const email = `df_${rnd(5)}@illubd.com`;
    const userId = rnd(16);
    const clientId = rnd(16);

    // 1. Login
    const login = await post(`${BASE}/user/login`, {
        password: 'dancow000', user_id: userId, third_id: email, third_platform: 'EMAIL',
        register_source: 'seo', platform_type: 'MOBILE', tenant_name: 'dream_face', platformType: 'MOBILE', tenantName: 'dream_face'
    }, null, clientId);

    // 2. Save Login
    await post(`${BASE}/user/save_user_login`, {
        device_system: 'PC-Mobile', user_id: userId, account_id: login.account_id, app_version: '4.7.1',
        time_zone: 7, platform_type: 'MOBILE', tenant_name: 'dream_face', platformType: 'MOBILE', tenantName: 'dream_face'
    }, login.token, clientId);

    // 3. Claim Free Credits (Penting biar gratis)
    await post(`${BASE}/rights/get_free_rights`, {
        user_id: userId, account_id: login.account_id, platform_type: 'MOBILE', tenant_name: 'dream_face', platformType: 'MOBILE', tenantName: 'dream_face'
    }, login.token, clientId);

    // 4. Submit Task Gambar
    const { param } = modelConfig;
    await post(`${BASE}/task/v2/submit`, {
        ext_info: { sing_title: prompt.slice(0, 50), model: param.model },
        media: { texts: [{ text: prompt }], images: [], audios: [], videos: [] },
        output: param.output,
        template: { releation_id: param.releation_id, template_id: param.template_id, play_types: param.play_types },
        user: { user_id: userId, account_id: login.account_id, app_version: '4.7.1' },
        work_type: 'AI_IMAGE', create_work_session: true, platform_type: 'MOBILE', tenant_name: 'dream_face', platformType: 'MOBILE', tenantName: 'dream_face'
    }, login.token, clientId);

    // Kembalikan Data Sesi ke Frontend
    return { userId, accountId: login.account_id, token: login.token, clientId };
}

// --- LOGIC 2: CEK STATUS (Polling) ---
async function checkStatus(jobData) {
    const { userId, accountId, token, clientId } = jobData;

    const ws = await post(`${BASE}/work_session/list`, {
        user_id: userId, account_id: accountId, page: 1, size: 5, session_type: 'AI_IMAGE',
        platform_type: 'MOBILE', tenant_name: 'dream_face', platformType: 'MOBILE', tenantName: 'dream_face'
    }, token, clientId);

    const s = ws.list?.[0];

    // Cek apakah sudah ada URL gambar
    if (s?.session_status === 200 && s?.work_details?.[0]?.image_urls?.length) {
        return { status: 'done', url: s.work_details[0].image_urls[0] };
    }
    // Cek apakah gagal (NSFW dll)
    if (s?.session_status < 0 && s?.session_status !== -1) {
        return { status: 'failed', error: "Gambar ditolak server (Mungkin NSFW)." };
    }
    // Masih proses
    return { status: 'pending' };
}

// --- HANDLER UTAMA VERCEL ---
module.exports = async (req, res) => {
    // Header CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { step, prompt, jobData } = req.body;

        // MODE 1: START (Mulai Job)
        if (step === 'start') {
            if (!prompt) return res.status(400).json({ error: "Prompt kosong!" });
            const data = await startJob(prompt);
            return res.json({ success: true, jobData: data });
        }
        
        // MODE 2: CHECK (Cek Status)
        else if (step === 'check') {
            if (!jobData) return res.status(400).json({ error: "Data job hilang!" });
            const status = await checkStatus(jobData);
            return res.json(status);
        }

    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, error: e.message });
    }
};
