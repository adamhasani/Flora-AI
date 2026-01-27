const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. PROMPT SISTEM (Bisa dihapus jika Agent sudah ada prompt-nya) ---
const promptStrictHTML = `WAJIB HTML: <b>tebal</b>, <br> baris baru. Jawab santai.`;

// --- 3. HELPER: PEMBERSIH ---
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, "<br>")
        .trim();
    return clean;
};

const getCleanHistory = (history) => {
    return history.map(msg => ({
        role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
        content: msg.content.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim()
    }));
};

// --- 4. FUNGSI EKSEKUTOR MISTRAL AGENT (FIXED) ---
async function runMistral(history) {
    if (!mistralKey) throw new Error("MISTRAL_API_KEY belum dipasang!");
    
    const cleanHist = getCleanHistory(history);

    // KITA PAKAI ENDPOINT AGENTS SESUAI CURL KAMU
    const response = await fetch('https://api.mistral.ai/v1/agents/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            agent_id: "ag_019bffc573ab7312bd80114c49ad7e17", // ID Flora AI kamu
            messages: cleanHist // Pakai struktur 'messages' standar
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Agent Error: ${data.error?.message || response.statusText}`);
    }

    if (data.choices && data.choices[0]) {
        return cleanResponse(data.choices[0].message.content);
    }
    
    throw new Error("Respon Agent Kosong");
}

// --- 5. MAIN HANDLER DENGAN BACKUP ---
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
            if (selectedModel === 'groq') {
                result = await (async () => {
                    const res = await groq.chat.completions.create({
                        messages: [{ role: "system", content: promptStrictHTML }, ...getCleanHistory(history)],
                        model: "llama-3.3-70b-versatile",
                    });
                    return cleanResponse(res.choices[0]?.message?.content);
                })();
                label = "Flora AI ⚡";
            } else if (selectedModel === 'gemini') {
                const modelGemini = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: promptStrictHTML });
                const cleanHist = getCleanHistory(history).map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));
                const lastMsg = cleanHist.pop().parts[0].text;
                const chat = modelGemini.startChat({ history: cleanHist });
                const finalRes = await chat.sendMessage(lastMsg);
                result = cleanResponse(finalRes.response.text());
                label = "Flora AI 🧠";
            } else {
                result = await runMistral(history);
                label = "Flora AI 🌿";
            }
            return res.json({ reply: `<b>[${label}]</b><br>${result}` });

        } catch (e) {
            // BACKUP KE GEMINI JIKA AGENT ERROR
            const backupModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const chat = backupModel.startChat({ history: [] });
            const finalRes = await chat.sendMessage(history[history.length-1].content);
            const backupResult = cleanResponse(finalRes.response.text());
            
            return res.json({ 
                reply: `<b>[Flora AI 🧠 - Backup]</b><br><small>Alasan: ${e.message}</small><br><br>${backupResult}` 
            });
        }
    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
