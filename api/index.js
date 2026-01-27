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

// --- 2. FUNGSI AI (DENGAN LABEL) ---

// MODE CEPAT (GROQ - Llama 3)
async function callGroq(history, systemPrompt) {
    console.log("🚀 Mode: GROQ (Llama 3)");
    const messages = [{ role: "system", content: systemPrompt }, ...history];
    const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile", // Versi Meta Stabil
        temperature: 0.6,
        max_tokens: 1024,
    });
    const text = cleanResponse(chatCompletion.choices[0]?.message?.content);
    
    // Tambahkan Label
    return `<b>[⚡ Groq]</b><br>${text}`;
}

// MODE PRO (GEMINI)
async function callGemini(history, systemPrompt) {
    console.log("🧠 Mode: GEMINI");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: systemPrompt });
    const geminiHist = history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] }));
    const lastMsg = geminiHist.pop().parts[0].text;
    const chat = model.startChat({ history: geminiHist });
    const result = await chat.sendMessage(lastMsg);
    const text = cleanResponse(result.response.text());
    
    // Tambahkan Label
    return `<b>[🧠 Gemini]</b><br>${text}`;
}

// MODE SANTAI (ANABOT)
async function callAnabot(history, systemPrompt) {
    console.log("🚙 Mode: ANABOT");
    const conversation = history.map(m => `${m.role==='user'?'User':'Flora'}: ${m.content}`).join('\n');
    const prompt = `[System: ${systemPrompt}]\n\nChat:\n${conversation}\n\nFlora:`;
    const url = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(prompt)}&type=Chat&apikey=freeApikey`;
    const resp = await fetch(url);
    const data = await resp.json();
    let text = data.data?.result?.text || data.result?.text || data.result || "";
    text = cleanResponse(text);
    
    // Tambahkan Label
    return `<b>[🚙 Anabot]</b><br>${text}`;
}

// --- 3. MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        let { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : "groq";

        // TAVILY SEARCH
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

        // ROUTER
        try {
            if (selectedModel === "gemini") {
                return res.json({ reply: await callGemini(history, systemPrompt) });
            } 
            else if (selectedModel === "anabot") {
                return res.json({ reply: await callAnabot(history, systemPrompt) });
            } 
            else {
                // Default: GROQ (Llama 3)
                return res.json({ reply: await callGroq(history, systemPrompt) });
            }
        } catch (err) {
            console.error(`❌ ${selectedModel} Gagal:`, err.message);
            // Fallback dengan Label Error
            try {
                const backup = await callAnabot(history, systemPrompt);
                // Kita beri tahu user kalau model pilihannya gagal
                const errorMessage = `<b>[⚠️ ${selectedModel} Error]</b><br>Dialihkan ke Backup...<br><br>`;
                // Hapus label Anabot asli biar ga dobel, atau biarin aja juga gapapa
                return res.json({ reply: errorMessage + backup });
            } catch (fatal) {
                return res.json({ reply: "Maaf, Flora sedang gangguan sistem total." });
            }
        }

    } catch (err) {
        return res.status(500).json({ reply: `Error: ${err.message}` });
    }
};
