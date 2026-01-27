const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// (Kita biarkan import-nya biar gak perlu hapus package.json, tapi gak dipake dulu)

module.exports = async (req, res) => {
    // 1. HEADER SETUP
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { history } = req.body;
        if (!history || !Array.isArray(history)) return res.status(400).json({ error: 'History invalid' });

        // Prompt Natural (Untuk Anabot)
        const promptNatural = `
            Nama kamu Flora. Kamu asisten AI yang cerdas, santai, dan to-the-point.
            Jawablah pertanyaan dengan jelas dan ringkas.
        `;

        // ============================================================
        // LAYER 1: ANABOT API (ONLY)
        // Backup Groq & Gemini DIBUANG DULU buat ngetes
        // ============================================================
        try {
            console.log("Mencoba Layer 1: Anabot API...");
            
            const conversationText = history.map(msg => {
                return `${msg.role === 'user' ? 'User' : 'Flora'}: ${msg.content}`;
            }).join('\n');

            const finalPrompt = `[System: ${promptNatural}]\n\nRiwayat Chat:\n${conversationText}\n\nFlora:`;
            const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
            
            const response = await fetch(apiUrl, { method: 'GET' });
            const data = await response.json();
            
            // Parsing Data
            let replyText = "";
            if (data.data && data.data.result && data.data.result.text) {
                replyText = data.data.result.text;
            } else if (data.result && data.result.text) {
                replyText = data.result.text;
            } else if (data.result) {
                replyText = data.result;
            } else if (typeof data === 'string') {
                replyText = data;
            } else {
                replyText = "Maaf, format jawaban aneh.";
            }
            
            // SUKSES
            return res.status(200).json({ reply: replyText });

        } catch (err1) {
            console.error("Layer 1 Gagal:", err1.message);
            
            // LANGSUNG ERROR (JANGAN KE BACKUP)
            return res.status(200).json({ 
                reply: `⚠️ TEST MODE: Anabot Gagal/Error. <br>Pesan Error: ${err1.message}` 
            });
        }

    } catch (finalError) {
        return res.status(500).json({ reply: `Error Sistem Fatal: ${finalError.message}` });
    }
};
