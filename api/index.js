const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SETUP ROTASI KUNCI ---
// Masukkan semua kunci di Vercel variable: GEMINI_KEYS
// Format: key1,key2,key3 (dipisah koma)
const rawKeys = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "";
const apiKeys = rawKeys.split(",").map(k => k.replace(/\\n/g, "").trim()).filter(k => k.length > 0);

if (apiKeys.length === 0) throw new Error("GEMINI_KEYS kosong! Masukkan minimal satu key.");

// Prompt Sistem
const promptFlora = "Kamu Flora AI. Jawab santai, singkat, jelas. Gunakan HTML <b> untuk poin penting.";

// --- DAFTAR MODEL YANG AKAN DICOBA (URUT DARI YANG TERTINGGI) ---
const MODEL_PRIORITY = [
    "gemini-3-flash-preview",  // Prioritas 1: Sesuai request (Masa Depan)
    "gemini-2.0-flash-exp"     // Prioritas 2: Flash '2.5' / Next Gen (Backup Valid)
];

// --- FUNGSI UTAMA (KEY ROTATION + MODEL FALLBACK) ---
async function runGeminiUltimate(message, imageBase64, history) {
    let lastError = null;

    // 1. Loop Model (Coba model 3 dulu, kalau gagal baru 2.5/2.0)
    for (const modelName of MODEL_PRIORITY) {
        
        // 2. Loop Key (Untuk setiap model, coba semua kunci biar ga limit)
        for (let i = 0; i < apiKeys.length; i++) {
            const currentKey = apiKeys[i];

            try {
                // Inisialisasi
                const genAI = new GoogleGenerativeAI(currentKey);
                const model = genAI.getGenerativeModel({ 
                    model: modelName, 
                    systemInstruction: promptFlora 
                });

                let resultText;

                if (imageBase64) {
                    // --- VISION MODE ---
                    const base64Data = imageBase64.split(",")[1];
                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                    
                    const result = await model.generateContent([
                        message || "Analisis gambar ini", 
                        { inlineData: { data: base64Data, mimeType } }
                    ]);
                    resultText = result.response.text();

                } else {
                    // --- CHAT MODE ---
                    const chatHistory = history.map(m => ({
                        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
                        parts: [{ text: m.content.replace(/<[^>]*>/g, '') }]
                    }));

                    const chat = model.startChat({
                        history: chatHistory,
                        generationConfig: { maxOutputTokens: 800 },
                    });

                    const result = await chat.sendMessage(message);
                    resultText = result.response.text();
                }

                // SUKSES! Kembalikan hasil & nama model yang berhasil dipakai
                return { text: resultText, usedModel: modelName };

            } catch (error) {
                lastError = error;
                const errMsg = error.message || "";

                // --- ANALISA ERROR ---
                
                // Jika errornya "404 Not Found" atau "400 Invalid Argument" -> Artinya Modelnya belum rilis/salah nama
                // Maka: BREAK loop Key, lanjut ke Model berikutnya (Model Fallback)
                if (errMsg.includes("404") || errMsg.includes("not found") || errMsg.includes("400")) {
                    console.warn(`Model ${modelName} tidak tersedia/gagal. Switch ke model bawahnya...`);
                    break; // Keluar dari loop Key, lanjut ke loop Model berikutnya
                }

                // Jika errornya "429" (Limit) -> Lanjut coba Key berikutnya di model yang sama
                if (errMsg.includes("429") || errMsg.includes("Quota") || errMsg.includes("503")) {
                    console.warn(`Key ke-${i+1} Limit di ${modelName}. Ganti Key...`);
                    continue; 
                }

                // Error lain (misal gambar rusak), lempar error
                throw error;
            }
        }
    }

    // Jika sampai sini berarti semua Model & semua Key gagal
    throw new Error(`Semua percobaan gagal. Terakhir: ${lastError.message}`);
}

// --- HANDLER REQUEST ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    try {
        const { text, usedModel } = await runGeminiUltimate(message, image, history);
        
        // Label Output biar tau pake model yang mana
        // Kalau yg jalan gemini-3 -> Output: [Flora 3.0]
        // Kalau yg jalan gemini-2.0 -> Output: [Flora 2.5 Flash]
        let label = "[Flora AI]";
        if (usedModel.includes("gemini-3")) label = "[Flora 3.0 Preview]";
        else if (usedModel.includes("2.0")) label = "[Flora 2.5 Flash]";

        return res.json({ reply: `<b>${label}</b><br>${text}` });

    } catch (error) {
        console.error("System Failure:", error.message);
        return res.json({ 
            reply: `<b>[SYSTEM ERROR]</b><br>
            Gagal memproses request.<br>
            <small>Error: ${error.message}</small>` 
        });
    }
};
