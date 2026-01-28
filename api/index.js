const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- 1. GROQ VISION (Tetap Llama karena masih relevan) ---
async function runGroq(history, message, imageBase64) {
    if (!groqKey) throw new Error("Key Groq Kosong");
    
    // Format pesan
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

// --- 2. GEMINI VISION (VERSI 3.0 FLASH) ---
async function runGemini(history, message, imageBase64) {
    // Format gambar
    const base64Data = imageBase64.split(",")[1];
    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType } };
    const userMsg = message || "Jelaskan gambar ini";

    try {
        // PERCOBAAN 1: GEMINI 3.0 FLASH (Sesuai request User)
        console.log("Mencoba Gemini 3.0 Flash...");
        const model3 = genAI.getGenerativeModel({ model: "gemini-3.0-flash", systemInstruction: promptFlora });
        const result3 = await model3.generateContent([userMsg, imagePart]);
        return result3.response.text();
    } 
    catch (e3) {
        console.log("Gemini 3.0 Gagal/Belum Rilis Publik, coba Gemini 2.0 Flash...", e3.message);
        
        // PERCOBAAN 2: GEMINI 2.0 FLASH (Standar 2026)
        try {
            const model2 = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: promptFlora });
            const result2 = await model2.generateContent([userMsg, imagePart]);
            return result2.response.text();
        } 
        catch (e2) {
            console.log("Gemini 2.0 Gagal, terpaksa pakai model legacy 1.5...", e2.message);
            
            // PERCOBAAN 3: GEMINI 1.5 (Jaga-jaga kalau server Google lagi aneh)
            const modelLegacy = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 
            const resultLegacy = await modelLegacy.generateContent([promptFlora + "\n" + userMsg, imagePart]);
            return resultLegacy.response.text();
        }
    }
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    // --- VISION ---
    if (image) {
        try {
            // Prioritas 1: Groq (Tetap paling ngebut)
            const resGroq = await runGroq(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Llama)]</b><br>${resGroq}` });
        } catch (e1) {
            // Prioritas 2: Gemini 3.0 / 2.0
            try {
                const resGemini = await runGemini(history, message, image);
                return res.json({ reply: `<b>[Flora Vision (Gemini 3.0)]</b><br>${resGemini}` });
            } catch (e2) {
                return res.json({ reply: `<b>[GAGAL]</b><br>Vision Error: ${e2.message}` });
            }
        }
    }

    // --- TEXT (Pakai Llama 3.3 biar aman) ---
    try {
        const groqText = new Groq({ apiKey: groqKey });
        let msgs = [{ role: "system", content: promptFlora }];
        history.forEach(m => msgs.push({ role: m.role==='model'?'assistant':'user', content: m.content.replace(/<[^>]*>/g,'') }));
        msgs.push({ role: "user", content: message });
        
        const resText = await groqText.chat.completions.create({
            messages: msgs, model: "llama-3.3-70b-versatile"
        });
        return res.json({ reply: `<b>[Flora AI]</b><br>${resText.choices[0]?.message?.content}` });
    } catch (e) {
        return res.status(500).json({ reply: `Error: ${e.message}` });
    }
};
