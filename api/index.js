const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- PROMPT KEPRIBADIAN FLORA (Sesuai keinginan Adam) ---
const promptFlora = `
    Nama kamu Flora AI. Kamu asisten cerdas mahasiswa Data Science di Universitas Harkat Negeri.
    Gaya bicara: Santai, informatif, dan membantu.
    PENTING: Gunakan HTML <b>tebal</b> dan <br> untuk baris baru. JANGAN gunakan markdown.
`;

const cleanResponse = (text) => {
    if (!text) return "";
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, "<br>").trim();
};

const getCleanHistory = (history) => {
    return history.map(msg => ({
        role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
        content: msg.content.replace(/<[^>]*>/g, '').trim()
    }));
};

// --- EKSEKUTOR GROQ (LLAMA 3.3 - SANGAT CEPAT & GRATIS) ---
async function runGroq(history) {
    const res = await groq.chat.completions.create({
        messages: [{ role: "system", content: promptFlora }, ...getCleanHistory(history)],
        model: "llama-3.3-70b-versatile",
    });
    return cleanResponse(res.choices[0]?.message?.content);
}

// --- EKSEKUTOR GEMINI (BACKUP) ---
async function runGemini(history) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
    const cleanHist = getCleanHistory(history).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    const lastMsg = cleanHist.pop().parts[0].text;
    const chat = model.startChat({ history: cleanHist });
    const result = await chat.sendMessage(lastMsg);
    return cleanResponse(result.response.text());
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history } = req.body;
        let result = "", label = "Flora AI ⚡";

        try {
            // Kita pakai Groq sebagai utama karena Mistral kamu limit
            result = await runGroq(history);
        } catch (e) {
            // Kalau Groq bermasalah, pindah ke Gemini
            console.log("Switching to Gemini...");
            result = await runGemini(history);
            label = "Flora AI 🧠";
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        return res.status(500).json({ reply: `Error: ${err.message}` });
    }
};
