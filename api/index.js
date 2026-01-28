// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const hfKey = getCleanKey(process.env.HF_API_KEY); 

const promptFlora = "Kamu Flora AI. Jawab santai, singkat, jelas. Gunakan HTML <b>.";

// --- FUNGSI KHUSUS QWEN (HUGGING FACE) ---
async function runQwenTest(message, imageBase64) {
    if (!hfKey) throw new Error("HF_API_KEY belum dipasang di Vercel!");

    const MODEL_ID = "Qwen/Qwen2.5-VL-72B-Instruct"; 
    
    // UPDATE URL BARU (ROUTER)
    // Domain lama 'api-inference' sudah mati (Error 410)
    const API_URL = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}/v1/chat/completions`;

    const payload = {
        model: MODEL_ID,
        messages: [
            { role: "system", content: promptFlora },
            { 
                role: "user", 
                content: imageBase64 
                ? [ // Kalau ada gambar
                    { type: "text", text: message || "Jelaskan gambar ini" },
                    { type: "image_url", image_url: { url: imageBase64 } }
                  ]
                : [ // Kalau cuma teks
                    { type: "text", text: message }
                  ]
            }
        ],
        max_tokens: 500,
        temperature: 0.7
    };

    console.log("Mengirim request ke Hugging Face Router...");

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
        throw new Error(`HF Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- HANDLER UTAMA ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { message, image } = req.body;

    try {
        const reply = await runQwenTest(message, image);
        return res.json({ 
            reply: `<b>[QWEN 2.5 VL]</b><br>${reply}` 
        });

    } catch (error) {
        console.error("Test Gagal:", error.message);
        return res.json({ 
            reply: `<b>[TEST GAGAL]</b><br>
            Error Router HF:<br>
            <pre style="color:red; white-space:pre-wrap;">${error.message}</pre>` 
        });
    }
};
