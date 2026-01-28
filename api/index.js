const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY);
const hfKey = getCleanKey(process.env.HF_API_KEY); // Tambah ini di Vercel!

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const promptFlora = "Kamu Flora AI. Santai, singkat, jelas. Pakai HTML <b>.";

// --- 1. GEMINI 2.0 FLASH (UTAMA) ---
async function runGemini(message, imageBase64, history) {
    if (!geminiKey) throw new Error("No Gemini Key");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp", systemInstruction: promptFlora });
    
    if (imageBase64) {
        const base64Data = imageBase64.split(",")[1];
        const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
        const result = await model.generateContent([message || "Jelaskan", { inlineData: { data: base64Data, mimeType } }]);
        return result.response.text();
    } else {
        const chat = model.startChat({ 
            history: history.map(m => ({ role: m.role==='model'?'model':'user', parts: [{ text: m.content.replace(/<[^>]*>/g,'') }] })) 
        });
        const result = await chat.sendMessage(message);
        return result.response.text();
    }
}

// --- 2. HUGGING FACE (QWEN 2.5 VL) - ALTERNATIF CADAS ---
async function runHuggingFace(message, imageBase64) {
    if (!hfKey) throw new Error("No HF Key");

    // Qwen 2.5 VL - 72B (Model Vision Open Source Terbaik saat ini)
    const MODEL_ID = "Qwen/Qwen2.5-VL-72B-Instruct"; 
    
    const payload = {
        model: MODEL_ID,
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
        max_tokens: 500
    };

    const response = await fetch(`https://api-inference.huggingface.co/models/${MODEL_ID}/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${hfKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`HF Error: ${err}`); // Biasanya kalau model lagi loading (Cold Boot)
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- 3. POLLINATIONS (CADANGAN DARURAT) ---
async function runPollinations(message, imageBase64) {
    const response = await fetch("https://text.pollinations.ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: [{ role: "system", content: promptFlora }, { role: "user", content: imageBase64 ? [{type:"text", text:message}, {type:"image_url", image_url:{url:imageBase64}}] : message }],
            model: "openai",
            jsonMode: false
        })
    });
    return await response.text();
}

// --- CONTROLLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    try {
        // SKENARIO:
        // 1. Coba Hugging Face (Qwen) dulu buat pamer Vision Open Source
        // 2. Kalau HF loading/error, lari ke Gemini 2.0
        // 3. Kalau Gemini mati, lari ke Pollinations
        
        // Catatan: HF Serverless kadang "Cold Boot" (lama loading awal), jadi kita jadikan opsi kedua atau pertama tergantung selera.
        // Di sini aku set Gemini tetap Utama karena paling ngebut, HF jadi opsi kedua.
        
        console.log("Mencoba Gemini 2.0...");
        const reply = await runGemini(message, image, history);
        return res.json({ reply: `<b>[Flora 2.0]</b><br>${reply}` });

    } catch (e1) {
        console.log("Gemini Skip:", e1.message);
        
        try {
            console.log("Mencoba Hugging Face (Qwen 2.5 VL)...");
            const reply = await runHuggingFace(message, image);
            return res.json({ reply: `<b>[Flora Qwen]</b><br>${reply}` });
        } catch (e2) {
            console.log("HF Skip:", e2.message);
            
            try {
                const reply = await runPollinations(message, image);
                return res.json({ reply: `<b>[Flora Backup]</b><br>${reply}` });
            } catch (e3) {
                return res.json({ reply: "Semua server sibuk." });
            }
        }
    }
};
