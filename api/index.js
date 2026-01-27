const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// Inisialisasi SDK
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

        // --- DEFINISI PROMPT ---
        
        // 1. Prompt NATURAL (Untuk Anabot & Gemini)
        const promptNatural = `
            Nama kamu Flora. Kamu asisten AI yang cerdas, santai, dan to-the-point.
            Jawablah pertanyaan dengan jelas dan ringkas.
            Jika ditanya terjemahan bahasa Inggris, langsung jawab artinya saja.
        `;

        // 2. Prompt HTML (Khusus Groq)
        const promptStrictHTML = `
            Nama kamu Flora. Asisten AI cerdas & rapi.
            ATURAN FORMATTING (WAJIB HTML):
            1. Gunakan <b>Teks Tebal</b> untuk poin penting.
            2. Gunakan <br> untuk ganti baris.
            3. Gunakan <ul><li>List</li></ul> untuk daftar.
            4. JANGAN gunakan Markdown (* atau #).
            5. Jawab to-the-point.
        `;

        // ============================================================
        // LAYER 1: ANABOT API (Prioritas Utama)
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
            
            // Parsing Data Anabot
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
            
            // Langsung kirim (Tanpa embel-embel "via backup")
            return res.status(200).json({ reply: replyText });

        } catch (err1) {
            console.error("Layer 1 Gagal (Anabot):", err1.message);

            // ============================================================
            // LAYER 2: GROQ LLAMA 3 (Backup Pertama)
            // ============================================================
            try {
                console.log("Mencoba Layer 2: Groq...");
                
                const messagesGroq = [
                    { role: "system", content: promptStrictHTML }, // Pakai HTML biar rapi
                    ...history
                ];

                const chatCompletion = await groq.chat.completions.create({
                    messages: messagesGroq,
                    model: "llama-3.3-70b-versatile",
                    temperature: 0.6,
                    max_tokens: 1024,
                });

                const replyGroq = chatCompletion.choices[0]?.message?.content || "Maaf, Groq error.";
                
                return res.status(200).json({ reply: replyGroq });

            } catch (err2) {
                console.error("Layer 2 Gagal (Groq):", err2.message);

                // ============================================================
                // LAYER 3: GOOGLE GEMINI (Backup Terakhir / Nuklir)
                // ============================================================
                try {
                    console.log("Mencoba Layer 3: Google Gemini...");
                    const modelGemini = genAI.getGenerativeModel({ 
                        model: "gemini-2.0-flash", 
                        systemInstruction: promptNatural 
                    });

                    const geminiHistory = history.map(msg => ({
                        role: msg.role === 'user' ? 'user' : 'model', 
                        parts: [{ text: msg.content }]
                    }));
                    const lastMsg = geminiHistory.pop().parts[0].text;

                    const chat = modelGemini.startChat({ history: geminiHistory });
                    const result = await chat.sendMessage(lastMsg);
                    
                    return res.status(200).json({ reply: result.response.text() });

                } catch (err3) {
                    console.error("Layer 3 Gagal (Fatal):", err3.message);
                    return res.status(200).json({ reply: "⚠️ Maaf, Flora pingsan. Semua server (Anabot, Groq, Google) lagi down." });
                }
            }
        }

    } catch (finalError) {
        return res.status(500).json({ reply: `Error Sistem Fatal: ${finalError.message}` });
    }
};
