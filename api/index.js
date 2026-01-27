const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. PROMPT SISTEM ---
const promptStrictHTML = `
    IDENTITAS: Nama kamu Flora. Kamu asisten AI mandiri yang cerdas.
    JANGAN PERNAH mengaku buatan Google/OpenAI/Meta. Kamu adalah Flora AI.
    WAJIB HTML: <b>tebal</b>, <br> baris baru, <ul><li> daftar. JANGAN Markdown.
    Jawab dalam Bahasa Indonesia santai dan to-the-point.
`;

// --- 3. HELPER: PEMBERSIH ---
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/```html/g, '').replace(/```/g, '')
        .replace(/\\n/g, "<br>").replace(/\n/g, "<br>")
        .trim();
    if (clean.includes('<li>') && !clean.includes('<ul>')) clean = `<ul>${clean}</ul>`;
    return clean;
};

const getCleanHistory = (history) => {
    return history.map(msg => ({
        role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
        content: msg.content.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim()
    }));
};

// --- 4. FUNGSI EKSEKUTOR ---

async function runMistral(history) {
    if (!mistralKey) throw new Error("API Key Mistral tidak ditemukan di Vercel");
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            model: "mistral-tiny", 
            messages: [{ role: "system", content: promptStrictHTML }, ...getCleanHistory(history)],
            temperature: 0.7
        })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Mistral Reject: ${data.error?.message || response.statusText}`);
    return cleanResponse(data.choices?.[0]?.message?.content);
}

async function runGroq(history) {
    if (!groqKey) throw new Error("API Key Groq Kosong");
    const res = await groq.chat.completions.create({
        messages: [{ role: "system", content: promptStrictHTML }, ...getCleanHistory(history)],
        model: "llama-3.3-70b-versatile",
    });
    return cleanResponse(res.choices[0]?.message?.content);
}

async function runGemini(history) {
    if (!geminiKey) throw new Error("API Key Gemini Kosong");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptStrictHTML });
    const cleanHist = getCleanHistory(history).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    const lastMsg = cleanHist.pop().parts[0].text;
    const chat = model.startChat({ history: cleanHist });
    const result = await chat.sendMessage(lastMsg);
    return cleanResponse(result.response.text());
}

// --- 5. MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : 'mistral';
        let result = "", label = "Flora AI";
        
        try {
            if (selectedModel === 'groq') { result = await runGroq(history); label = "Flora AI ⚡"; }
            else if (selectedModel === 'gemini') { result = await runGemini(history); label = "Flora AI 🧠"; }
            else { result = await runMistral(history); label = "Flora AI 🌿"; }
            
            return res.json({ reply: `<b>[${label}]</b><br>${result}` });
        } catch (e) {
            console.error("DEBUG:", e.message);
            const backup = await runGemini(history);
            return res.json({ 
                reply: `<b>[Flora AI 🧠 - Backup Aktif]</b><br><small>Alasan: ${e.message}</small><br><br>${backup}` 
            });
        }
    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
