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
    Nama kamu Flora. Jawab dalam Bahasa Indonesia santai. 
    WAJIB HTML: <b>tebal</b>, <br> baris baru. JANGAN Markdown.
`;

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

// --- 4. FUNGSI EKSEKUTOR MISTRAL (DEBUG MODE) ---
async function runMistral(history) {
    if (!mistralKey) throw new Error("VARIABEL_KOSONG: MISTRAL_API_KEY tidak ditemukan di Environment Variables Vercel.");
    
    const cleanHist = getCleanHistory(history);

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            model: "mistral-tiny", 
            messages: [{ role: "system", content: promptStrictHTML }, ...cleanHist],
            temperature: 0.7
        })
    });

    const data = await response.json();

    // JIKA ERROR: Kirim detailnya langsung tanpa filter
    if (!response.ok) {
        const errorDetail = JSON.stringify(data.error || data);
        throw new Error(`KODE_HTTP_${response.status}: ${errorDetail}`);
    }

    if (data.choices && data.choices[0]) {
        return cleanResponse(data.choices[0].message.content);
    }
    
    throw new Error("RESPON_STRUKTUR_SALAH: Mistral membalas tapi formatnya tidak dikenal.");
}

// --- 5. MAIN HANDLER (TANPA BACKUP) ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : 'mistral';
        
        let result = "";
        let label = "Flora AI 🌿";

        // Kita PAKSA pakai Mistral (atau model pilihan) tanpa blok try-catch fallback
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
            // EKSEKUSI MISTRAL
            result = await runMistral(history);
        }

        return res.json({ reply: `<b>[${label}]</b><br>${result}` });

    } catch (err) {
        // TAMPILKAN ERROR ASLI DI CHAT
        console.error("DEBUG_LOG:", err.message);
        return res.json({ 
            reply: `<b>[❌ ERROR SISTEM]</b><br><br><b>Pesan:</b><br>${err.message}<br><br><small><i>Catatan: Mas Adam, cek pesan di atas buat tahu kenapa Mistral gagal.</i></small>` 
        });
    }
};
