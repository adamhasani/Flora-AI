const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// Inisialisasi SDK
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TAVILY_KEY = process.env.TAVILY_API_KEY; // Pastikan ada di Vercel

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

        // --- 2. DETEKTOR & PENCARI INTERNET (TAVILY) ---
        let internetContext = "";
        const lastMessage = history[history.length - 1].content;
        
        // Kata kunci pemicu pencarian
        const keywords = ["siapa", "kapan", "dimana", "pemenang", "terbaru", "harga", "cuaca", "berita", "skor", "2024", "2025", "2026"];
        const isNewsQuestion = keywords.some(word => lastMessage.toLowerCase().includes(word));

        if (isNewsQuestion && TAVILY_KEY) {
            try {
                console.log("🔍 Sedang Googling via Tavily...");
                const searchResp = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: TAVILY_KEY,
                        query: lastMessage,
                        search_depth: "basic",
                        include_answer: true,
                        max_results: 3
                    })
                });
                const searchData = await searchResp.json();
                
                if (searchData.results) {
                    const texts = searchData.results.map(r => `Title: ${r.title}\nIsi: ${r.content}`).join("\n\n");
                    internetContext = `\n[DATA FAKTA DARI INTERNET]:\n${texts}\n(Gunakan data ini sebagai prioritas kebenaran!)\n`;
                }
            } catch (err) {
                console.error("Gagal searching:", err.message);
            }
        }

        // --- 3. MENYUSUN INSTRUKSI (PROMPT) ---
        // Kita masukkan data internet (kalau ada) ke dalam instruksi utama
        const systemInstructionText = `
            Nama kamu Flora. Kamu asisten AI yang cerdas, rapi, dan membantu.
            ${internetContext} 
            
            ATURAN FORMATTING (WAJIB HTML):
            1. Gunakan tag <b>Teks Tebal</b> untuk poin penting.
            2. Gunakan tag <br> untuk ganti baris.
            3. Gunakan tag <ul><li>List</li></ul> untuk daftar.
            4. JANGAN gunakan Markdown.
            5. JIKA ADA DATA INTERNET DI ATAS, gunakan itu untuk menjawab pertanyaan terkini.
        `;

        // ============================================================
        // LAYER 1: GOOGLE GEMINI RESMI (Prioritas Utama)
        // ============================================================
        try {
            console.log("Mencoba Layer 1: Google Gemini...");
            const modelGemini = genAI.getGenerativeModel({ 
                model: "gemini-2.0-flash", 
                systemInstruction: systemInstructionText 
            });

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

                // Anabot juga akan terima data Tavily lewat systemInstructionText
                const finalPrompt = `[System: ${systemInstructionText}]\n\nRiwayat Chat:\n${conversationText}\n\nFlora:`;
                
                const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
                
                const response = await fetch(apiUrl, { method: 'GET' });
                const data = await response.json();
                
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
                // LAYER 3: GROQ (Backup Akhir - Mixtral/Anti-Meta)
                // ============================================================
                try {
                    console.log("Mencoba Layer 3: Groq (Mixtral)...");
                    
                    const messagesGroq = [
                        { role: "system", content: systemInstructionText },
                        ...history
                    ];

                    const chatCompletion = await groq.chat.completions.create({
                        messages: messagesGroq,
                        model: "mixtral-8x7b-32768", // Anti-Meta Model
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
