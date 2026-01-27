const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// Inisialisasi SDK (Pastikan API Key ada di Vercel Settings)
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

        // --- PERSIAPAN DATA UMUM ---
        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        // System Prompt (Instruksi Utama)
        const systemInstructionText = `
            Nama kamu Flora. Asisten AI cerdas & rapi.
            Info Waktu: Hari ini ${today}.
            
            ATURAN:
            1. Gunakan HTML (<b>, <br>, <ul>). JANGAN Markdown.
            2. Jawab to-the-point.
            3. Jika ditanya bahasa Inggris, langsung jawab artinya.
        `;

        // ============================================================
        // LAYER 1: GOOGLE GEMINI RESMI (Primary)
        // ============================================================
        try {
            console.log("Mencoba Layer 1: Google Gemini...");
            const modelGemini = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash", 
                systemInstruction: systemInstructionText 
            });

            // Format History khusus Gemini (user/model)
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
                
                // Anabot butuh String Panjang, bukan Array
                const conversationText = history.map(msg => {
                    return `${msg.role === 'user' ? 'User' : 'Flora'}: ${msg.content}`;
                }).join('\n');

                const finalPrompt = `[System: ${systemInstructionText}]\n\nChat History:\n${conversationText}\n\nFlora:`;
                
                const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
                
                const response = await fetch(apiUrl, { method: 'GET' });
                const data = await response.json();
                
                let replyText = data.result || (typeof data === 'string' ? data : JSON.stringify(data));
                
                return res.status(200).json({ reply: replyText + " <br><br><i>(Dijawab via Backup 1)</i>" });

            } catch (err2) {
                console.error("Layer 2 Gagal (Anabot):", err2.message);

                // ============================================================
                // LAYER 3: GROQ LLAMA 3 (Backup Terakhir/Nuklir)
                // ============================================================
                try {
                    console.log("Mencoba Layer 3: Groq...");
                    
                    const messagesGroq = [
                        { role: "system", content: systemInstructionText },
                        ...history
                    ];

                    const chatCompletion = await groq.chat.completions.create({
                        messages: messagesGroq,
                        model: "llama-3.3-70b-versatile",
                        temperature: 0.6,
                        max_tokens: 1024,
                    });

                    const replyGroq = chatCompletion.choices[0]?.message?.content || "Maaf, Groq juga error.";
                    
                    return res.status(200).json({ reply: replyGroq + " <br><br><i>(Dijawab via Backup Akhir)</i>" });

                } catch (err3) {
                    console.error("Layer 3 Gagal (Fatal):", err3.message);
                    return res.status(200).json({ reply: "⚠️ Maaf, Flora pingsan. Semua server (Google, Anabot, Groq) lagi down." });
                }
            }
        }

    } catch (finalError) {
        return res.status(500).json({ reply: `Error Sistem Fatal: ${finalError.message}` });
    }
};
