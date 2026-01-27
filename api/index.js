const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY); // <--- Taruh di Vercel

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. PROMPT SISTEM ---
const promptStrictHTML = `
    Nama kamu Flora. Kamu asisten AI cerdas & modern.
    WAJIB GUNAKAN HTML: <b>tebal</b>, <br> baris baru, <ul><li> daftar.
    DILARANG gunakan Markdown (** atau #). Jawab dalam Bahasa Indonesia santai.
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

// A. MISTRAL AI (Ganti Hugging Face/Anabot)
async function runMistral(history) {
    if (!mistralKey) throw new Error("Mistral Key Kosong");
    const cleanHist = getCleanHistory(history);

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: promptStrictHTML },
                ...cleanHist
            ],
            temperature: 0.7
        })
    });

    const data = await response.json();
    const replyText = data.choices?.[0]?.message?.content || "";
    
    if (!replyText) throw new Error("Mistral Sedang Sibuk");
    return cleanResponse(replyText);
}

// B. GROQ (Llama 3.3)
async function runGroq(history) {
    if (!groqKey) throw new Error("Groq Key Kosong");
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
    if (!geminiKey) throw new Error("Gemini Key Kosong");
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

// --- 5. MAIN HANDLER DENGAN FALLBACK BERLAPIS ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : 'qwen';
        let result = "", label = "Flora AI";
        
        // Logika Eksekusi
        try {
            if (selectedModel === 'groq') {
                result = await runGroq(history); label = "Flora AI ⚡";
            } else if (selectedModel === 'gemini') {
                result = await runGemini(history); label = "Flora AI 🧠";
            } else {
                result = await runMistral(history); label = "Flora AI 🌿";
            }
            return res.json({ reply: `<b>[${label}]</b><br>${result}` });
        } catch (e) {
            // Jika model utama (Mistral/Groq) gagal, lempar ke Gemini sebagai nyawa terakhir
            console.log("Model utama gagal, mencoba backup Gemini...");
            const backup = await runGemini(history);
            return res.json({ reply: `<b>[Flora AI 🧠]</b><br>${backup}` });
        }
    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
