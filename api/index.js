const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- 1. GROQ VISION ---
async function runGroq(history, message, imageBase64) {
    // Cek Key dulu
    if (!groqKey || groqKey.length < 10) throw new Error("API Key Groq Tidak Terdeteksi di Vercel!");

    // Siapkan pesan
    let messages = [{ role: "system", content: promptFlora }];
    
    // Convert history
    history.forEach(m => {
        messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content.replace(/<[^>]*>/g, '') });
    });

    messages.push({
        role: "user",
        content: [
            { type: "text", text: message || "Jelaskan gambar ini" },
            { type: "image_url", image_url: { url: imageBase64 } }
        ]
    });

    const res = await groq.chat.completions.create({
        messages, 
        model: "llama-3.2-11b-vision-preview", 
        temperature: 0.5, 
        max_tokens: 512
    });
    return res.choices[0]?.message?.content || "Tidak ada respon.";
}

// --- 2. GEMINI VISION ---
async function runGemini(history, message, imageBase64) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
    
    // Format gambar untuk Gemini
    const base64Data = imageBase64.split(",")[1];
    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
    
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType } };
    
    const result = await model.generateContent([message || "Jelaskan gambar ini", imagePart]);
    return result.response.text();
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    // KHUSUS DEBUGGING VISION
    if (image) {
        let errorLog = "";
        
        // 1. Coba GROQ
        try {
            console.log("Mencoba Groq Vision...");
            const result = await runGroq(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Llama)]</b><br>${result}` });
        } catch (e1) {
            console.error("Groq Gagal:", e1.message);
            errorLog += `Groq Error: ${e1.message} | `;
        }

        // 2. Coba GEMINI
        try {
            console.log("Mencoba Gemini Vision...");
            const result = await runGemini(history, message, image);
            return res.json({ reply: `<b>[Flora Vision (Gemini)]</b><br>${result}` });
        } catch (e2) {
            console.error("Gemini Gagal:", e2.message);
            errorLog += `Gemini Error: ${e2.message}`;
        }

        // Kalau sampai sini, berarti DUA-DUANYA GAGAL
        return res.json({ 
            reply: `<b>[GAGAL TOTAL]</b><br>Dua-duanya error, Bos.<br><br><b>Detail Error:</b><br>${errorLog}` 
        });
    }

    // ... (Logika Chat Teks Biasa ada di sini, tapi saya fokuskan Vision dulu biar fix) ...
    // Untuk teks biasa, kembalikan response simple biar gak error
    return res.json({ reply: "Mode teks aman. Coba upload gambar lagi untuk cek error Vision." });
};
