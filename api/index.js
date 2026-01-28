const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- 1. GROQ VISION (GANTI MODEL KE 90B) ---
async function runGroq(history, message, imageBase64) {
    if (!groqKey || groqKey === "dummy") throw new Error("API Key Groq Kosong/Salah");

    let messages = [{ role: "system", content: promptFlora }];
    history.forEach(m => messages.push({ role: m.role==='model'?'assistant':'user', content: m.content.replace(/<[^>]*>/g,'') }));
    messages.push({
        role: "user",
        content: [
            { type: "text", text: message || "Jelaskan gambar ini" },
            { type: "image_url", image_url: { url: imageBase64 } }
        ]
    });

    // KITA PAKAI YANG 90B KARENA YANG 11B SUDAH DIMATIKAN GROQ
    const res = await groq.chat.completions.create({
        messages, 
        model: "llama-3.2-90b-vision-preview", 
        max_tokens: 512
    });
    return res.choices[0]?.message?.content;
}

// --- 2. GEMINI VISION (GANTI KE 2.0 EXPERIMENTAL) ---
async function runGemini(history, message, imageBase64) {
    // Kita pakai 2.0 Flash Experimental.
    // Kenapa? Karena 1.5 error 404 (Gak ketemu).
    // Sedangkan 2.0 tadi error 429 (Limit). 
    // Mending kena Limit (masih ada harapan) daripada 404 (mati total).
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp", systemInstruction: promptFlora });
    
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

    // --- JALUR GAMBAR (VISION) ---
    if (image) {
        // 1. Coba GROQ (Prioritas Utama)
        try {
            const resGroq = await runGroq(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Llama 90B)]</b><br>${resGroq}` });
        } catch (e1) {
            console.error("Groq Gagal:", e1.message);
            errorLog += `<b>Groq (90B) Error:</b> ${e1.message}<br>`;
        }

        // 2. Coba GEMINI (Backup)
        try {
            const resGemini = await runGemini(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Gemini 2.0)]</b><br>${resGemini}` });
        } catch (e2) {
            console.error("Gemini Gagal:", e2.message);
            errorLog += `<b>Gemini (2.0) Error:</b> ${e2.message}`;
        }

        return res.json({ 
            reply: `<b>[GAGAL LAGI]</b><br>Duh, apes banget hari ini.<br><br>${errorLog}` 
        });
    }

    // --- JALUR TEKS BIASA ---
    try {
        if (!groqKey) throw new Error("Key Groq Kosong");
        // Pakai Llama 3.3 (Ini masih hidup dan paling stabil buat teks)
        const resText = await groq.chat.completions.create({
            messages: [{ role: "user", content: message }],
            model: "llama-3.3-70b-versatile"
        });
        return res.json({ reply: `<b>[Flora AI]</b><br>${resText.choices[0]?.message?.content}` });
    } catch (e) {
        return res.json({ reply: `Error Text: ${e.message}` });
    }
};
