const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    // ==========================================
    // 🔍 FITUR RAHASIA: CEK MODEL
    // ==========================================
    if (message && message.toLowerCase() === "cek model") {
        try {
            if (!groqKey) throw new Error("Key Groq Kosong");
            
            // Minta daftar model ke Groq
            const list = await groq.models.list();
            
            // Filter biar rapi
            const allModels = list.data.map(m => m.id);
            const visionModels = allModels.filter(id => id.includes("vision"));
            const textModels = allModels.filter(id => !id.includes("vision") && !id.includes("whisper"));

            let reply = "<b>📡 HASIL SCAN MODEL GROQ:</b><br><br>";
            
            reply += "👁️ <b>MODEL VISION (Mata):</b><br>";
            if (visionModels.length > 0) {
                visionModels.forEach(m => reply += `- ${m}<br>`);
            } else {
                reply += "❌ Tuh kan! Tidak ada model Vision yang aktif!<br>";
            }

            reply += "<br>📝 <b>MODEL TEKS (Otak):</b><br>";
            textModels.forEach(m => reply += `- ${m}<br>`);

            return res.json({ reply: reply });

        } catch (e) {
            return res.json({ reply: `Gagal Cek Model: ${e.message}` });
        }
    }
    // ==========================================

    // --- JALUR VISION (GAMBAR) ---
    // Sementara kita pakai Gemini 1.5 Flash (Tanpa embel-embel latest)
    // Karena kita belum tau model vision Groq yg bener apa (tunggu hasil cek model kamu)
    if (image) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
            const base64Data = imageBase64.split(",")[1];
            const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
            
            const result = await model.generateContent([
                message || "Jelaskan gambar ini", 
                { inlineData: { data: base64Data, mimeType: mimeType } }
            ]);
            return res.json({ reply: `<b>[Flora Vision (Gemini)]</b><br>${result.response.text()}` });
        } catch (e) {
            return res.json({ reply: `<b>[GAGAL]</b><br>Tunggu hasil 'cek model' dulu.<br>Error Gemini: ${e.message}` });
        }
    }

    // --- JALUR TEKS BIASA ---
    try {
        const resText = await groq.chat.completions.create({
            messages: [{ role: "user", content: message }],
            model: "llama-3.3-70b-versatile"
        });
        return res.json({ reply: `<b>[Flora AI]</b><br>${resText.choices[0]?.message?.content}` });
    } catch (e) {
        return res.json({ reply: `Error Text: ${e.message}` });
    }
};
