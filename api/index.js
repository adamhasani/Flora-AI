const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// Inisialisasi SDK
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// --- FUNGSI PEMBERSIH (SANITIZER) ---
// Ini rahasianya biar output ga ada \u003c atau \\n aneh
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/```html/g, '')      // Hapus tag code block
        .replace(/```/g, '')          // Hapus sisa backticks
        .replace(/\\n/g, "<br>")      // Ubah \n jadi <br>
        .replace(/\n/g, "<br>")       // Ubah Enter asli jadi <br>
        .replace(/\\"/g, '"')         // Hilangkan slash di kutip
        .replace(/\\u003c/g, "<")     // Ubah kode alien <
        .replace(/\\u003e/g, ">")     // Ubah kode alien >
        .replace(/\\/g, "")           // Bersihkan sisa slash sampah
        .trim();                      // Hapus spasi kosong awal/akhir
        
    // Hapus kutip di awal dan akhir jika Gemini membungkusnya string
    if (clean.startsWith('"') && clean.endsWith('"')) {
        clean = clean.slice(1, -1);
    }
    return clean;
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { history } = req.body;
        if (!history || !Array.isArray(history)) return res.status(400).json({ error: 'History invalid' });

        // --- 1. TAVILY SEARCH (PENCARI FAKTA) ---
        let internetContext = "";
        const lastMessage = history[history.length - 1].content;
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
                    internetContext = `\n[DATA FAKTA DARI INTERNET]:\n${texts}\n(Gunakan data ini sebagai prioritas!)\n`;
                }
            } catch (err) { console.error("Tavily skip:", err.message); }
        }

        // --- 2. PROMPT UTAMA ---
        const systemInstructionText = `
            Nama kamu Flora. Kamu asisten AI yang cerdas, rapi, dan membantu.
            ${internetContext} 
            
            ATURAN FORMATTING (WAJIB DITAATI):
            1. Output HARUS HTML murni.
            2. JANGAN gunakan escape characters (seperti \\n atau \\"). Tulis tag <br> secara langsung.
            3. Gunakan <b>...</b> untuk tebal.
            4. Gunakan <ul><li>...</li></ul> untuk list.
            5. JANGAN pakai Markdown.
        `;

        // ============================================================
        // LAYER 1: GOOGLE GEMINI
        // ============================================================
        try {
            console.log("Layer 1: Gemini...");
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
            
            // PAKAI FUNGSI PEMBERSIH DI SINI
            return res.status(200).json({ reply: cleanResponse(result.response.text()) });

        } catch (err1) {
            console.error("Layer 1 Gagal:", err1.message);
            
            // ============================================================
            // LAYER 2: ANABOT (Backup)
            // ============================================================
            try {
                console.log("Layer 2: Anabot...");
                const conversationText = history.map(msg => `${msg.role === 'user' ? 'User' : 'Flora'}: ${msg.content}`).join('\n');
                const finalPrompt = `[System: ${systemInstructionText}]\n\nRiwayat:\n${conversationText}\n\nFlora:`;
                const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
                
                const response = await fetch(apiUrl, { method: 'GET' });
                const data = await response.json();
                
                let replyText = "";
                if (data.data?.result?.text) replyText = data.data.result.text;
                else if (data.result?.text) replyText = data.result.text;
                else if (data.result) replyText = data.result;
                else replyText = typeof data === 'string' ? data : "Format Error";

                // PAKAI FUNGSI PEMBERSIH DI SINI JUGA
                return res.status(200).json({ reply: cleanResponse(replyText) });

            } catch (err2) {
                console.error("Layer 2 Gagal:", err2.message);

                // ============================================================
                // LAYER 3: GROQ (Mixtral)
                // ============================================================
                try {
                    console.log("Layer 3: Groq...");
                    const messagesGroq = [{ role: "system", content: systemInstructionText }, ...history];
                    const chatCompletion = await groq.chat.completions.create({
                        messages: messagesGroq,
                        model: "mixtral-8x7b-32768", 
                        temperature: 0.6,
                    });
                    const replyGroq = chatCompletion.choices[0]?.message?.content || "";
                    
                    // DAN DI SINI JUGA
                    return res.status(200).json({ reply: cleanResponse(replyGroq) });

                } catch (err3) {
                    return res.status(200).json({ reply: "⚠️ Maaf, Flora pingsan. Semua server down." });
                }
            }
        }
    } catch (finalError) {
        return res.status(500).json({ reply: `Error: ${finalError.message}` });
    }
};
