const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// 1. PEMBERSIH
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text.replace(/```html/g, '').replace(/```/g, '').replace(/\\n/g, "<br>").replace(/\n/g, "<br>").replace(/\\"/g, '"').replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\/g, "").trim();
    if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
    return clean;
};

// 2. FUNGSI AI (DENGAN WATERMARK)
// Kita tambahkan label [NamaBot] di depan jawaban biar ketahuan siapa yang jawab

// A. GROQ
async function callGroq(history, systemPrompt) {
    console.log("🚀 Eksekusi: GROQ");
    const messages = [{ role: "system", content: systemPrompt }, ...history];
    const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "mixtral-8x7b-32768",
        temperature: 0.6,
    });
    const text = cleanResponse(chatCompletion.choices[0]?.message?.content);
    return `<b>[⚡ Groq]</b><br>${text}`; // <--- Watermark
}

// B. GEMINI
async function callGemini(history, systemPrompt) {
    console.log("🧠 Eksekusi: GEMINI");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: systemPrompt });
    const geminiHist = history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] }));
    const lastMsg = geminiHist.pop().parts[0].text;
    const chat = model.startChat({ history: geminiHist });
    const result = await chat.sendMessage(lastMsg);
    const text = cleanResponse(result.response.text());
    return `<b>[🧠 Gemini]</b><br>${text}`; // <--- Watermark
}

// C. ANABOT
async function callAnabot(history, systemPrompt) {
    console.log("🚙 Eksekusi: ANABOT");
    const conversation = history.map(m => `${m.role==='user'?'User':'Flora'}: ${m.content}`).join('\n');
    const prompt = `[System: ${systemPrompt}]\n\nChat:\n${conversation}\n\nFlora:`;
    const url = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(prompt)}&type=Chat&apikey=freeApikey`;
    const resp = await fetch(url);
    const data = await resp.json();
    let text = data.data?.result?.text || data.result?.text || data.result || "";
    text = cleanResponse(text);
    return `<b>[🚙 Anabot]</b><br>${text}`; // <--- Watermark
}

// 3. MAIN HANDLER
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        let { history, model } = req.body;
        // Pastikan model terbaca, kalau kosong default 'groq'
        const selectedModel = model ? model.toLowerCase() : "groq";
        
        console.log("👉 Request Model dari Frontend:", selectedModel); // Cek Logs Vercel

        // --- TAVILY ---
        let internetContext = "";
        const cleanLastMsg = history[history.length - 1].content;
        const keywords = ["siapa", "kapan", "dimana", "pemenang", "terbaru", "berita", "skor", "2025", "lirik", "lagu"];
        if (TAVILY_KEY && keywords.some(w => cleanLastMsg.toLowerCase().includes(w))) {
            try {
                const sResp = await fetch("https://api.tavily.com/search", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: TAVILY_KEY, query: cleanLastMsg })
                });
                const sData = await sResp.json();
                if (sData.results) internetContext = `\n[DATA INTERNET]:\n${sData.results.map(r => r.content).join('\n')}\n`;
            } catch (e) { console.log("Tavily Skip"); }
        }

        const systemPrompt = `Nama kamu Flora. AI Cerdas & Rapi. ${internetContext} ATURAN: Output WAJIB HTML (<b>, <br>, <ul>). JANGAN Markdown.`;

        // --- LOGIKA PEMILIHAN ---
        // Jika user pilih Groq, kita paksa Groq. Jika error, baru lapor error (JANGAN FALLBACK DULU biar ketahuan salahnya)
        
        try {
            if (selectedModel === "gemini") {
                return res.json({ reply: await callGemini(history, systemPrompt) });
            } 
            else if (selectedModel === "anabot") {
                return res.json({ reply: await callAnabot(history, systemPrompt) });
            } 
            else {
                // Default GROQ
                return res.json({ reply: await callGroq(history, systemPrompt) });
            }
        } catch (err) {
            // Kalau model pilihan ERROR, baru kita kasih tau
            console.error("❌ Model Error:", err.message);
            
            // Backup Terakhir: Gemini (Tanpa Watermark Error biar user tetep dapet jawaban)
            // Tapi kita kasih tanda [⚠️ Backup]
            try {
                const backupReply = await callGemini(history, systemPrompt);
                return res.json({ reply: `<b>[⚠️ Error pada ${selectedModel}, beralih ke Gemini]</b><br>` + backupReply.replace("<b>[🧠 Gemini]</b><br>", "") });
            } catch (fatal) {
                return res.json({ reply: "Semua server mati." });
            }
        }

    } catch (err) {
        return res.status(500).json({ reply: `System Error: ${err.message}` });
    }
};
