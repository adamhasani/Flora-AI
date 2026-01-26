const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async (req, res) => {
    // 1. CORS Headers (Biar browser tidak rewel soal izin akses)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request (Basa-basi browser)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Pastikan hanya terima metode POST
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // Ambil pesan dari user
        const { message } = req.body;

        // --- BAGIAN PENTING: API KEY ---
        // Kita coba ambil dari Environment Variable Vercel dulu
        let apiKey = process.env.GEMINI_API_KEY;

        // JAGA-JAGA: Kalau Env Var gagal/kosong, script akan pakai key manual di bawah ini
        // Hapus tanda // di baris bawah ini dan masukkan key-mu jika cara Env Var tetap gagal
        // apiKey = "AIzaSyD-MASUKKAN-KEY-KAMU-DISINI"; 

        if (!apiKey) {
            throw new Error("API Key kosong! Cek Settings Vercel atau paste manual di kodingan.");
        }

        // --- SETTING KEPRIBADIAN (OTAK) ---
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: "Nama kamu Flora. Kamu AI asisten pribadi yang gaul, santai, dan sedikit tengil. Gunakan bahasa Indonesia sehari-hari (lu/gue atau aku/kamu)."
        });

        // --- LOGIC ROUTER (MODULAR) ---
        // Contoh: Jika user ketik "/ping", langsung balas tanpa ke Gemini (Hemat kuota)
        if (message.trim().toLowerCase() === "/ping") {
            return res.status(200).json({ reply: "Pong! Aku aktif kok 🤖" });
        }

        // Kirim ke Google Gemini
        const result = await model.generateContent(message);
        const response = result.response.text();

        // Kirim balasan ke tampilan chat
        return res.status(200).json({ reply: response });

    } catch (error) {
        // --- BAGIAN DIAGNOSA ERROR ---
        console.error("Error Backend:", error);
        
        // Disini kuncinya: Kita kirim pesan error aslinya ke layar chat
        return res.status(500).json({ 
            reply: "⚠️ ERROR SYSTEM: " + error.message 
        });
    }
};
