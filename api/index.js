const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- 1. GROQ VISION ---
async function runGroq(history, message, imageBase64) {
    // Cek Key dengan teliti
    if (!groqKey || groqKey === "dummy") throw new Error("API Key Groq BELUM DIPASANG di Vercel!");

    let messages = [{ role: "system", content: promptFlora }];
    history.forEach(m => messages.push({ role: m.role==='model'?'assistant':'user', content: m.content.replace(/<[^>]*>/g,'') }));
    messages.push({
        role: "user",
        content: [
            { type: "text", text: message || "Jelaskan gambar ini" },
            { type: "image_url", image_url: { url: imageBase64 } }
        ]
    });

    const res = await groq.chat.completions.create({
        messages, model: "llama-3.2-11b-vision-preview", max_tokens: 512
    });
    return res.choices[0]?.message?.content;
}

// --- 2. GEMINI VISION (VERSI POLOS) ---
async function runGemini(history, message, imageBase64) {
    // Pakai nama model yang PALING STANDAR (jangan pakai latest/v2/v3 dulu)
    // Kalau ini 404 juga, berarti Google API lagi down atau Key Gemini bermasalah.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
    
    const base64Data = imageBase64.split(",")[1];
    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
    
    const result = await model.generateContent([
        message || "Jelaskan gambar ini", 
        { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);
    return result.response.text();
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;
    let errorLog = "";

    // --- VISION ---
    if (image) {
        // 1. Coba GROQ
        try {
            const resGroq = await runGroq(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Llama)]</b><br>${resGroq}` });
        } catch (e1) {
            console.error("Groq Gagal:", e1.message);
            errorLog += `<b>Groq Error:</b> ${e1.message}<br>`;
        }

        // 2. Coba GEMINI (Kalau Groq Gagal)
        try {
            const resGemini = await runGemini(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Gemini)]</b><br>${resGemini}` });
        } catch (e2) {
            console.error("Gemini Gagal:", e2.message);
            errorLog += `<b>Gemini Error:</b> ${e2.message}`;
        }

        // LAPORAN ERROR LENGKAP
        return res.json({ 
            reply: `<b>[GAGAL TOTAL]</b><br>Kedua AI menyerah.<br><br>📝 <b>Laporan Error:</b><br>${errorLog}<br><br>👉 <i>Cek Environment Variables di Vercel kamu.</i>` 
        });
    }

    // --- TEXT ONLY ---
    try {
        if (!groqKey || groqKey === "dummy") throw new Error("API Key Groq Kosong");
        const resText = await groq.chat.completions.create({
            messages: [{ role: "user", content: message }],
            model: "llama-3.3-70b-versatile"
        });
        return res.json({ reply: `<b>[Flora AI]</b><br>${resText.choices[0]?.message?.content}` });
    } catch (e) {
        return res.json({ reply: `Error Text: ${e.message}` });
    }
};
