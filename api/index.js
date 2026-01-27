const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- PERBAIKAN DI SINI ---
// Kita ambil kunci dari 'GEMINI_API_KEY' sesuai settingan Vercel kamu
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY; 

// Init SDK
const genAI = new GoogleGenerativeAI(apiKey || "dummy");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy" });
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// PEMBERSIH HTML
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

// --- FUNGSI AI ---

// 1. GROQ (Llama 3)
async function callGroq(history, systemPrompt) {
    console.log("🚀 Mode: GROQ");
    const messages = [{ role: "system", content: systemPrompt }, ...history];
    const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
        max_tokens: 1024,
    });
    return `<b>[⚡ Groq]</b><br>${cleanResponse(chatCompletion.choices[0]?.message?.content)}`;
}

// 2. GEMINI (Google 1.5 Flash)
async function callGemini(history, systemPrompt) {
    console.log("🧠 Mode: GEMINI");
    
    // Matikan Sensor
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        systemInstruction: systemPrompt,
        safetySettings: safetySettings
    });

    const geminiHist = history.map(msg => ({ 
        role: msg.role === 'user' ? 'user' : 'model', 
        parts: [{ text: msg.content }] 
    }));
    
    const lastMsg = geminiHist.pop().parts[0].text;
    const chat = model.startChat({ history: geminiHist });
    const result = await chat.sendMessage(lastMsg);
    
    return `<b>[🧠 Gemini]</b><br>${cleanResponse(result.response.text())}`;
}

// 3. ANABOT
async function callAnabot(history, systemPrompt) {
    console.log("🚙 Mode: ANABOT");
    const conversation = history.map(m => `${m.role==='user'?'User':'Flora'}: ${m.content}`).join('\n');
    const prompt = `[System: ${systemPrompt}]\n\nChat:\n${conversation}\n\nFlora:`;
    const url = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(prompt)}&type=Chat&apikey=freeApikey`;
    const resp = await fetch(url);
    const data = await resp.json();
    let text = data.data?.result?.text || data.result?.text || data.result || "";
    return `<b>[🚙 Anabot]</b><br>${cleanResponse(text)}`;
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

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
                return res.json({ reply: await callGroq(history, systemPrompt) });
            }
        } catch (err) {
            console.error(`❌ ${selectedModel} Gagal:`, err.message);
            // Fallback
            try {
                const backup = await callAnabot(history, systemPrompt);
                return res.json({ reply: `<b>[⚠️ ${selectedModel} Error]</b><br>Key salah/kurang, beralih ke Anabot...<br><br>` + backup.replace("<b>[🚙 Anabot]</b><br>", "") });
            } catch (fatal) {
                return res.json({ reply: "Semua server mati. Cek nama Variable di Vercel!" });
            }
        }

    } catch (err) {
        return res.status(500).json({ reply: `System Error: ${err.message}` });
    }
};
