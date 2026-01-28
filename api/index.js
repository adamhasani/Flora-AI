const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY); // WAJIB ADA!

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- 1. MISTRAL VISION (PIXTRAL) - UTAMA ---
async function runMistralVision(message, imageBase64) {
    if (!mistralKey) throw new Error("MISTRAL_API_KEY belum dipasang di Vercel!");

    // Mistral API butuh format 'data:image/jpeg;base64,...'
    // Jadi imageBase64 dari frontend sudah aman (biasanya sudah ada header data:...)

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
            model: "pixtral-12b-2409", // <--- INI MODEL VISION MISTRAL
            messages: [
                { role: "system", content: promptFlora },
                {
                    role: "user",
                    content: [
                        { type: "text", text: message || "Jelaskan gambar ini" },
                        { type: "image_url", image_url: url = imageBase64 } 
                    ]
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Mistral Error: ${err.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- 2. GEMINI VISION (BACKUP) ---
async function runGeminiVision(message, imageBase64) {
    // Kita pakai Gemini 2.0 Flash (Backup kalau Pixtral gagal)
    const base64Data = imageBase64.split(",")[1];
    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType } };

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: promptFlora });
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

    // --- VISION (GAMBAR) ---
    if (image) {
        // Coba MISTRAL (PIXTRAL) Dulu
        try {
            console.log("Mencoba Mistral Pixtral...");
            const reply = await runMistralVision(message, image);
            return res.json({ reply: `<b>[Flora Vision (Pixtral)]</b><br>${reply}` });
        } catch (e1) {
            console.log("Mistral Gagal:", e1.message);
            
            // Backup ke GEMINI
            try {
                console.log("Switch ke Gemini 2.0...");
                const reply = await runGeminiVision(message, image);
                return res.json({ reply: `<b>[Flora Vision (Gemini 2.0)]</b><br>${reply}` });
            } catch (e2) {
                return res.json({ 
                    reply: `<b>[GAGAL TOTAL]</b><br>Mistral & Gemini menyerah.<br><small>Mistral: ${e1.message}<br>Gemini: ${e2.message}</small>` 
                });
            }
        }
    }

    // --- TEKS (GROQ LLAMA 3.3) ---
    try {
        if (!groqKey) throw new Error("Key Groq Kosong");
        const resText = await groq.chat.completions.create({
            messages: [
                { role: "system", content: promptFlora },
                ...history.map(m => ({ role: m.role==='model'?'assistant':'user', content: m.content.replace(/<[^>]*>/g,'') })),
                { role: "user", content: message }
            ],
            model: "llama-3.3-70b-versatile"
        });
        return res.json({ reply: `<b>[Flora AI]</b><br>${resText.choices[0]?.message?.content}` });
    } catch (e) {
        return res.json({ reply: `Error Text: ${e.message}` });
    }
};
