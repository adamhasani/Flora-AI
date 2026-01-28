const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- SETUP API KEYS ---
// Groq & Gemini tetap dipakai untuk backup atau chat teks biasa
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);

const groq = new Groq({ apiKey: groqKey || "dummy" });
const genAI = new GoogleGenerativeAI(geminiKey || "dummy");

const promptFlora = "Nama kamu Flora AI. Jawab santai, singkat, dan jelas dalam Bahasa Indonesia. Gunakan HTML <b> untuk tebal.";

// --- 1. POLLINATIONS VISION (PRIORITAS UTAMA - GRATIS & NO LIMIT) ---
async function runPollinationsVision(message, imageBase64) {
    // Pollinations menerima format OpenAI-style
    const response = await fetch("https://text.pollinations.ai/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messages: [
                { role: "system", content: promptFlora },
                {
                    role: "user",
                    content: [
                        { type: "text", text: message || "Jelaskan gambar ini" },
                        { 
                            type: "image_url", 
                            image_url: { 
                                url: imageBase64 // Pollinations support Base64 langsung
                            } 
                        }
                    ]
                }
            ],
            model: "openai", // Magic string biar Pollinations pilih model vision terbaik (biasanya GPT-4o)
            jsonMode: false,
            seed: Math.floor(Math.random() * 1000) // Biar respon variatif
        })
    });

    if (!response.ok) {
        throw new Error(`Pollinations Error: ${response.statusText}`);
    }

    // Pollinations mengembalikan teks mentah (raw string), bukan JSON
    const text = await response.text(); 
    return text;
}

// --- 2. GROQ VISION (BACKUP) ---
async function runGroqVision(message, imageBase64) {
    if (!groqKey) throw new Error("Key Groq Kosong");
    const completion = await groq.chat.completions.create({
        model: "llama-3.2-90b-vision-preview",
        messages: [
            { role: "system", content: promptFlora },
            {
                role: "user",
                content: [
                    { type: "text", text: message || "Jelaskan gambar ini" },
                    { type: "image_url", image_url: { url: imageBase64 } }
                ]
            }
        ],
        max_tokens: 512,
    });
    return completion.choices[0].message.content;
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    // CORS Standard
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    // --- LOGIKA VISION (GAMBAR) ---
    if (image) {
        // COBA 1: POLLINATIONS (Gratis, No Key)
        try {
            console.log("Mencoba Pollinations Vision...");
            const reply = await runPollinationsVision(message, image);
            return res.json({ reply: `<b>[Flora Vision (Pollinations)]</b><br>${reply}` });
        } catch (e1) {
            console.log("Pollinations Gagal:", e1.message);

            // COBA 2: GROQ VISION (Backup Cepat)
            try {
                console.log("Switch ke Groq Vision...");
                const reply = await runGroqVision(message, image);
                return res.json({ reply: `<b>[Flora Vision (Groq)]</b><br>${reply}` });
            } catch (e2) {
                console.log("Groq Gagal:", e2.message);
                
                // COBA 3: GEMINI (Backup Terakhir)
                try {
                    const base64Data = image.split(",")[1];
                    const mimeType = image.substring(image.indexOf(":") + 1, image.indexOf(";"));
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: promptFlora });
                    const result = await model.generateContent([message || "Jelaskan gambar ini", { inlineData: { data: base64Data, mimeType } }]);
                    return res.json({ reply: `<b>[Flora Vision (Gemini)]</b><br>${result.response.text()}` });
                } catch (e3) {
                    return res.json({ 
                        reply: `<b>[VISION GAGAL]</b><br>Maaf, Pollinations & Backup sibuk.<br><small>${e1.message}</small>` 
                    });
                }
            }
        }
    }

    // --- LOGIKA TEKS BIASA (Chat Biasa) ---
    try {
        // Prioritas Chat Teks: Groq Llama 3.3 (Super Cepat & Cerdas)
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
        // Fallback Teks ke Gemini
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro", systemInstruction: promptFlora });
            const chat = model.startChat({ history: [] }); // Simpel tanpa history dulu untuk fallback
            const result = await chat.sendMessage(message);
            return res.json({ reply: `<b>[Flora AI (Gemini)]</b><br>${result.response.text()}` });
        } catch (errGemini) {
            return res.json({ reply: `Error: ${e.message}` });
        }
    }
};
