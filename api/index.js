const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// Init SDK
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// --- 1. PEMBERSIH & VALIDATOR ---
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/```html/g, '').replace(/```/g, '')
        .replace(/\\n/g, "<br>").replace(/\n/g, "<br>")
        .replace(/\\"/g, '"').replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">").replace(/\\/g, "")
        .trim();
    if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
    return clean;
};

const isValidReply = (text) => {
    if (!text || text.length < 5) return false;
    const errors = ["tidak dapat menemukan", "error generating", "internal server error", "upstream request timeout"];
    if (errors.some(k => text.toLowerCase().includes(k))) return false;
    return true;
};

// --- 2. FUNGSI AI ---

// Mode Fast (Groq - Mixtral)
async function callGroq(history, systemPrompt) {
    console.log("🚀 Mode: GROQ (Fast)");
    const messages = [{ role: "system", content: systemPrompt }, ...history];
    const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "mixtral-8x7b-32768",
        temperature: 0.6,
        max_tokens: 1024,
    });
    return cleanResponse(chatCompletion.choices[0]?.message?.content);
}

// Mode Pro (Gemini 2.0)
async function callGemini(history, systemPrompt) {
    console.log("🧠 Mode: GEMINI (Pro)");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: systemPrompt });
    const geminiHist = history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] }));
    const lastMsg = geminiHist.pop().parts[0].text;
    const chat = model.startChat({ history: geminiHist });
    const result = await chat.sendMessage(lastMsg);
    const text = cleanResponse(result.response.text());
    if (!isValidReply(text)) throw new Error("Gemini Validation Failed");
    return text;
}

// Mode Semi (Anabot)
async function callAnabot(history, systemPrompt) {
    console.log("🚙 Mode: ANABOT (Semi)");
    const conversation = history.map(m => `${m.role==='user'?'User':'Flora'}: ${m.content}`).join('\n');
    const prompt = `[System: ${systemPrompt}]\n\nChat:\n${conversation}\n\nFlora:`;
    const url = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(prompt)}&type=Chat&apikey=freeApikey`;
    const resp = await fetch(url);
    const data = await resp.json();
    let text = data.data?.result?.text || data.result?.text || data.result || "";
    text = cleanResponse(text);
    if (!isValidReply(text)) throw new Error("Anabot Validation Failed");
    return text;
}

// --- 3. MAIN HANDLER ---
module.exports = async (req, res) => {
    // Header Wajib
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        // TERIMA DATA 'MODEL' DARI LUAR
        let { history, model } = req.body; 
        
        if (!history || !Array.isArray(history)) return res.status(400).json({ error: 'History invalid' });

        // TENTUKAN MODE (Default: groq)
        // Pilihan: "groq", "gemini", "anabot"
        const selectedModel = model ? model.toLowerCase() : "groq"; 

        // --- TAVILY SEARCH ---
        let internetContext = "";
        const cleanLastMsg = history[history.length - 1].content;
        const keywords = ["siapa", "kapan", "dimana", "pemenang", "terbaru", "berita", "skor", "2025", "lirik", "lagu"];
        if (TAVILY_KEY && keywords.some(w => cleanLastMsg.toLowerCase().includes(w))) {
            try {
                const searchResp = await fetch("https://api.tavily.com/search", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: TAVILY_KEY, query: cleanLastMsg, search_depth: "basic", include_answer: true, max_results: 3 })
                });
                const sData = await searchResp.json();
                if (sData.results) internetContext = `\n[DATA INTERNET]:\n${sData.results.map(r => r.content).join('\n')}\n`;
            } catch (e) { console.log("Tavily Skip"); }
        }

        const systemPrompt = `
            Nama kamu Flora. AI Cerdas & Rapi.
            ${internetContext}
            ATURAN: Output WAJIB HTML (<b>, <br>, <ul>). JANGAN Markdown.
        `;

        // --- EKSEKUSI SESUAI PILIHAN ---
        try {
            if (selectedModel === "gemini" || selectedModel === "pro") {
                // User minta PRO -> Coba Gemini -> Backup Groq
                try { return res.json({ reply: await callGemini(history, systemPrompt) }); }
                catch (e) { return res.json({ reply: await callGroq(history, systemPrompt) }); }
            } 
            else if (selectedModel === "anabot" || selectedModel === "semi") {
                // User minta SEMI -> Coba Anabot -> Backup Groq
                try { return res.json({ reply: await callAnabot(history, systemPrompt) }); }
                catch (e) { return res.json({ reply: await callGroq(history, systemPrompt) }); }
            } 
            else {
                // DEFAULT (GROQ/FAST) -> Coba Groq -> Backup Anabot
                try { return res.json({ reply: await callGroq(history, systemPrompt) }); }
                catch (e) { return res.json({ reply: await callAnabot(history, systemPrompt) }); }
            }
        } catch (fatal) {
            return res.json({ reply: "⚠️ Semua server sibuk." });
        }

    } catch (err) {
        return res.status(500).json({ reply: `Error: ${err.message}` });
    }
};
