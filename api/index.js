// --- SETUP ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const hfKey = getCleanKey(process.env.HF_API_KEY);

const promptFlora = "Kamu Flora AI. Jawab santai, singkat, jelas. Gunakan HTML <b>.";

// --- QWEN 2.5 VL (Versi 7B - RINGAN & NGEBUT) ---
async function runQwenLite(message, imageBase64) {
    if (!hfKey) throw new Error("HF_API_KEY belum dipasang!");

    // Kita pakai model 7B (Bukan 72B). Ini kuncinya biar gak error.
    const MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct";
    
    // URL Router terbaru
    const API_URL = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}/v1/chat/completions`;

    const payload = {
        model: MODEL_ID,
        messages: [
            { role: "system", content: promptFlora },
            { 
                role: "user", 
                content: imageBase64 
                ? [ // Format Vision
                    { type: "text", text: message || "Jelaskan gambar ini" },
                    { type: "image_url", image_url: { url: imageBase64 } }
                  ]
                : [ // Format Teks Biasa
                    { type: "text", text: message }
                  ]
            }
        ],
        max_tokens: 500, // Jangan maruk token biar cepet
        temperature: 0.6
    };

    console.log(`Menembak Hugging Face (${MODEL_ID})...`);

    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${hfKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        // Kalau error 503, artinya model lagi 'pemanasan' (loading).
        // Biasanya request kedua langsung berhasil.
        throw new Error(`HF Status ${response.status}: ${errText.substring(0, 200)}...`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    // Setup CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { message, image } = req.body;

    try {
        const reply = await runQwenLite(message, image);
        return res.json({ 
            reply: `<b>[Flora Qwen 7B]</b><br>${reply}` 
        });

    } catch (error) {
        console.error("Qwen Gagal:", error.message);
        
        // Error Handling yang informatif
        let tips = "";
        if (error.message.includes("503")) {
            tips = "<br><br><i>Tips: Model lagi loading (Cold Boot). Coba kirim ulang pesan ini dalam 10 detik.</i>";
        }

        return res.json({ 
            reply: `<b>[ERROR]</b><br>
            Gagal connect ke Hugging Face.<br>
            <small style="color:#ff6b6b">${error.message}</small>
            ${tips}` 
        });
    }
};
