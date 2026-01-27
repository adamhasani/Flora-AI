const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// Cek Environment Variable di Awal
const CHECK_ENV = {
    GEMINI: process.env.API_KEY ? "✅ Ada" : "❌ KOSONG",
    GROQ: process.env.GROQ_API_KEY ? "✅ Ada" : "❌ KOSONG",
};

const genAI = new GoogleGenerativeAI(process.env.API_KEY || "dummy");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy" });

module.exports = async (req, res) => {
    // Header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : "groq";
        
        // Pesan Prompt Standar
        const systemPrompt = "Kamu Flora. Jawab singkat dan jelas dalam format HTML <b>...</b>.";
        
        // ---------------------------------------------------------
        // TES 1: CEK GEMINI (Langsung Tembak)
        // ---------------------------------------------------------
        if (selectedModel === "gemini") {
            try {
                console.log("🧠 Mencoba Gemini...");
                const modelGemini = genAI.getGenerativeModel({ 
                    model: "gemini-1.5-flash",
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    ]
                });
                
                // Coba chat sederhana tanpa history dulu untuk tes koneksi
                const chat = modelGemini.startChat({ history: [] });
                const result = await chat.sendMessage("Tes koneksi. Jawab: Halo.");
                
                return res.json({ reply: `<b>[✅ Gemini Sukses]</b><br>${result.response.text()}` });

            } catch (errGemini) {
                // INI YANG KITA CARI: LOG ERROR LENGKAP
                console.error("Gemini Error:", errGemini);
                const fullError = JSON.stringify(errGemini, Object.getOwnPropertyNames(errGemini), 2);
                
                return res.json({ 
                    reply: `<b>[❌ GEMINI ERROR DETECTED]</b><br>` +
                           `Status Key: ${CHECK_ENV.GEMINI}<br>` +
                           `Pesan Error Pendek: <b style="color:red">${errGemini.message}</b><br><br>` +
                           `Detail Teknis:<br><pre style="font-size:10px; background:#333; padding:5px;">${fullError}</pre>` 
                });
            }
        }

        // ---------------------------------------------------------
        // TES 2: CEK GROQ
        // ---------------------------------------------------------
        else {
             try {
                console.log("🚀 Mencoba Groq...");
                const chatCompletion = await groq.chat.completions.create({
                    messages: [{ role: "user", content: "Tes koneksi." }],
                    model: "llama-3.3-70b-versatile",
                });
                return res.json({ reply: `<b>[✅ Groq Sukses]</b><br>${chatCompletion.choices[0]?.message?.content}` });

            } catch (errGroq) {
                return res.json({ 
                    reply: `<b>[❌ GROQ ERROR]</b><br>` +
                           `Status Key: ${CHECK_ENV.GROQ}<br>` +
                           `Pesan: ${errGroq.message}` 
                });
            }
        }

    } catch (globalErr) {
        return res.status(500).json({ reply: `System Crash: ${globalErr.message}` });
    }
};
