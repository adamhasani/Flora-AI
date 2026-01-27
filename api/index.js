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

        // --- INSTRUKSI FORMAT RAPI (GEMINI STYLE) ---
        // Kita pasang ini di SEMUA layer biar outputnya konsisten cantik.
        const systemInstructionText = `
            Nama kamu Flora. Kamu asisten AI yang cerdas, rapi, dan membantu.
            
            ATURAN FORMATTING (WAJIB HTML):
            1. Gunakan tag <b>Teks Tebal</b> untuk poin penting atau judul.
            2. Gunakan tag <br> untuk ganti baris (jangan pakai newline biasa).
            3. Gunakan tag <ul><li>Poin 1</li><li>Poin 2</li></ul> untuk daftar.
            4. JANGAN gunakan Markdown (seperti ** atau -) karena akan berantakan.
            5. Jawab dengan struktur yang enak dibaca.
            
            JIKA DITANYA TERJEMAHAN:
            Langsung jawab artinya saja.
        `;

        // ============================================================
        // LAYER 1: GOOGLE GEMINI RESMI (Prioritas Utama)
        // ============================================================
        try {
            console.log("Mencoba Layer 1: Google Gemini...");
            const modelGemini = genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash", // Versi Cerdas & Stabil
                systemInstruction: systemInstructionText 
            });

            // Konversi History ke Format Gemini
            const geminiHistory = history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model', 
                parts: [{ text: msg.content }]
            }));
            const lastMsg = geminiHistory.pop().parts[0].text;

            const chat = modelGemini.startChat({ history: geminiHistory });
            const result = await chat.sendMessage(lastMsg);
            
            return res.status(200).json({ reply: result.response.text() });

        } catch (err1) {
            console.error("Layer 1 Gagal (Google):", err1.message);
            
            // ============================================================
            // LAYER 2: ANABOT API (Backup 1)
            // ============================================================
            try {
                console.log("Mencoba Layer 2: Anabot API...");
                
                const conversationText = history.map(msg => {
                    return `${msg.role === 'user' ? 'User' : 'Flora'}: ${msg.content}`;
                }).join('\n');

                // Gabungkan Instruksi HTML + Chat History
                const finalPrompt = `[System Instruction: ${systemInstructionText}]\n\nRiwayat Chat:\n${conversationText}\n\nFlora:`;
                
                const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
                
                const response = await fetch(apiUrl, { method: 'GET' });
                const data = await response.json();
                
                // Parsing Data (Logic Fix)
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
                
                return res.status(200).json({ reply: replyText });

            } catch (err2) {
                console.error("Layer 2 Gagal (Anabot):", err2.message);

                // ============================================================
                // LAYER 3: GROQ (Backup Akhir - NON META)
                // ============================================================
                try {
                    console.log("Mencoba Layer 3: Groq (Mixtral)...");
                    
                    const messagesGroq = [
                        { role: "system", content: systemInstructionText },
                        ...history
                    ];

                    const chatCompletion = await groq.chat.completions.create({
                        messages: messagesGroq,
                        // Ganti model jadi Mixtral (Bukan Meta/Llama)
                        model: "mixtral-8x7b-32768", 
                        temperature: 0.6,
                        max_tokens: 1024,
                    });

                    const replyGroq = chatCompletion.choices[0]?.message?.content || "Maaf, Groq error.";
                    
                    return res.status(200).json({ reply: replyGroq });

                } catch (err3) {
                    return res.status(200).json({ reply: "⚠️ Maaf, Flora pingsan. Semua server down." });
                }
            }
        }

    } catch (finalError) {
        return res.status(500).json({ reply: `Error Sistem Fatal: ${finalError.message}` });
    }
};
