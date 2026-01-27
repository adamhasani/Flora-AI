const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. PROMPT SISTEM ---
const promptStrictHTML = `
    Nama kamu Flora. Kamu asisten AI yang cerdas dan modern.
    WAJIB GUNAKAN HTML: <b>tebal</b>, <br> untuk baris baru, <ul><li> untuk daftar.
    DILARANG gunakan Markdown (** atau #). Jawab dalam Bahasa Indonesia yang santai tapi sopan.
`;

// --- 3. HELPER: PEMBERSIH ---
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Convert ** ke <b>
        .replace(/\*(.*?)\*/g, '<i>$1</i>')     // Convert * ke <i>
        .replace(/^- (.*$)/gim, '<li>$1</li>')  // Convert list - ke <li>
        .replace(/```html/g, '').replace(/```/g, '')
        .replace(/\\n/g, "<br>").replace(/\n/g, "<br>")
        .trim();
    if (clean.includes('<li>')) clean = `<ul>${clean}</ul>`;
    return clean;
};

const getCleanHistory = (history) => {
    return history.map(msg => ({
        role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
        content: msg.content.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim()
    }));
};

// --- 4. FUNGSI EKSEKUTOR ---

// A. QWEN (GANTI ANABOT) - Gratis & Stabil
async function runQwen(history) {
    const cleanHist = getCleanHistory(history);
    const payload = {
        messages: [{ role: "system", content: promptStrictHTML }, ...cleanHist],
        model: "qwen",
        seed: 42
    };

    const response = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const replyText = await response.text();
    if (!replyText) throw new Error("Qwen Sedang Sibuk");
    return cleanResponse(replyText);
}

// B. GROQ
async function runGroq(history) {
    if (!groqKey) throw new Error("API Key GROQ Kosong!");
    const messagesGroq = [{ role: "system", content: promptStrictHTML }, ...getCleanHistory(history)];
    const res = await groq.chat.completions.create({
        messages: messagesGroq,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
    });
    return cleanResponse(res.choices[0]?.message?.content);
}

// C. GEMINI
async function runGemini(history) {
    if (!geminiKey) throw new Error("API Key GEMINI Kosong!");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: promptStrictHTML });
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
        const selectedModel = model ? model.toLowerCase() : 'qwen';
        let result = "", label = "Flora AI";
        
        try {
            if (selectedModel === 'groq') {
                result = await runGroq(history); label = "Flora AI ⚡";
            } else if (selectedModel === 'gemini') {
                result = await runGemini(history); label = "Flora AI 🧠";
            } else {
                result = await runQwen(history); label = "Flora AI 🌿";
            }
            return res.json({ reply: `<b>[${label}]</b><br>${result}` });
        } catch (e) {
            return res.json({ reply: `<b>[❌ Flora Error]</b><br>Sistem ${selectedModel} sedang limit. Coba model lain ya!` });
        }
    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
