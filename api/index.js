const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. PROMPT SISTEM ---
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

// --- 4. FUNGSI EKSEKUTOR MISTRAL AGENT (NO BACKUP) ---
async function runMistralAgent(history) {
    if (!mistralKey) throw new Error("VARIABEL_KOSONG: MISTRAL_API_KEY belum ada di Vercel.");
    
    const cleanHist = getCleanHistory(history);

    const response = await fetch('https://api.mistral.ai/v1/agents/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            agent_id: "ag_019bffc573ab7312bd80114c49ad7e17",
            messages: cleanHist
        })
    });

    const data = await response.json();

    if (!response.ok) {
        // Kirim error mentah agar Mas Adam bisa lihat detailnya
        throw new Error(`KODE_HTTP_${response.status}: ${JSON.stringify(data.error || data)}`);
    }

    if (data.choices && data.choices[0]) {
        return cleanResponse(data.choices[0].message.content);
    }
    
    throw new Error("RESPON_KOSONG: Agent tidak memberikan jawaban.");
}

// --- 5. MAIN HANDLER (LOCK MODE) ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : 'mistral';
        
        let result = "";
        let label = "Flora AI";

        // Eksekusi Berdasarkan Model Pilihan (Tanpa Fallback ke Gemini)
        if (selectedModel === 'groq') {
            const resGroq = await groq.chat.completions.create({
                messages: [{ role: "system", content: promptStrictHTML }, ...getCleanHistory(history)],
                model: "llama-3.3-70b-versatile",
            });
            result = cleanResponse(resGroq.choices[0]?.message?.content);
            label = "Flora AI ⚡";
        } else if (selectedModel === 'gemini') {
            const modelGemini = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptStrictHTML });
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
            // PAKSA MISTRAL AGENT
            result = await runMistralAgent(history);
            label = "Flora AI 🌿";
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        // Tampilkan error aslinya di chat
        return res.json({ 
            reply: `<b>[❌ ERROR MISTRAL AGENT]</b><br><br><b>Detail:</b><br>${err.message}` 
        });
    }
};
