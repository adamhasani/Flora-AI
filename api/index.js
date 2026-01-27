const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// 1. PEMBERSIH RESPONS (Sanitizer)
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/```html/g, '')
        .replace(/```/g, '')
        .replace(/\\n/g, "<br>")
        .replace(/\n/g, "<br>")
        .replace(/\\"/g, '"')
        .replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">")
        .replace(/\\/g, "")
        .trim();
    if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
    return clean;
};

// 2. VALIDATOR RESPONS (Ini Solusi Error Kamu!)
// Kalau jawaban mengandung kata-kata error, kita anggap GAGAL biar pindah layer.
const isValidReply = (text) => {
    if (!text || text.length < 5) return false; // Terlalu pendek = Gagal
    const errorKeywords = [
        "tidak dapat menemukan pola",
        "error generating response",
        "internal server error",
        "maaf format salah",
        "upstream request timeout"
    ];
    // Kalau ada kata error di atas, return FALSE (Gagal)
    if (errorKeywords.some(keyword => text.toLowerCase().includes(keyword))) return false;
    return true;
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

        // --- TAVILY: Tambah Keyword LIRIK & LAGU ---
        let internetContext = "";
        const lastMessage = history[history.length - 1].content;
        const keywords = ["siapa", "kapan", "dimana", "pemenang", "terbaru", "berita", "skor", "2025", "lirik", "lagu", "chord"];
        const isNewsQuestion = keywords.some(word => lastMessage.toLowerCase().includes(word));

        if (isNewsQuestion && TAVILY_KEY) {
            try {
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
                    const texts = searchData.results.map(r => `Info: ${r.content}`).join("\n\n");
                    internetContext = `\n[DATA INTERNET]:\n${texts}\n(Gunakan ini sebagai referensi utama!)\n`;
                }
            } catch (err) { console.log("Tavily skip"); }
        }

        const systemInstructionText = `
            Nama kamu Flora. Kamu asisten AI yang cerdas & rapi.
            ${internetContext}
            ATURAN FORMATTING (WAJIB HTML):
            1. Gunakan <b>tebal</b>, <br> baris baru, <ul><li>list</li></ul>.
            2. JANGAN pakai Markdown.
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
                role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }]
            }));
            const chat = modelGemini.startChat({ history: geminiHistory });
            const result = await chat.sendMessage(geminiHistory.pop().parts[0].text);
            const text = cleanResponse(result.response.text());

            // CEK VALIDASI
            if (!isValidReply(text)) throw new Error("Gemini jawab error");
            
            return res.status(200).json({ reply: text });

        } catch (err1) {
            console.error("Layer 1 Gagal:", err1.message);
            
            // ============================================================
            // LAYER 2: ANABOT (Backup 1)
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
                else replyText = typeof data === 'string' ? data : "";
                
                replyText = cleanResponse(replyText);

                // CEK VALIDASI (Ini yang akan nangkep error "Tidak dapat menemukan...")
                if (!isValidReply(replyText)) throw new Error("Anabot jawab error text");

                return res.status(200).json({ reply: replyText });

            } catch (err2) {
                console.error("Layer 2 Gagal:", err2.message);

                // ============================================================
                // LAYER 3: GROQ (Backup Akhir)
                // ============================================================
                try {
                    console.log("Layer 3: Groq...");
                    const messagesGroq = [{ role: "system", content: systemInstructionText }, ...history];
                    const chatCompletion = await groq.chat.completions.create({
                        messages: messagesGroq,
                        model: "mixtral-8x7b-32768", 
                        temperature: 0.6,
                    });
                    const replyGroq = cleanResponse(chatCompletion.choices[0]?.message?.content);
                    
                    return res.status(200).json({ reply: replyGroq });

                } catch (err3) {
                    return res.status(200).json({ reply: "⚠️ Maaf, Flora pingsan. Semua server sibuk." });
                }
            }
        }

    } catch (finalError) {
        return res.status(500).json({ reply: `Error: ${finalError.message}` });
    }
};
