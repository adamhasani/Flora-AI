const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- SETUP API KEYS ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k=>k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// --- HELPER: PEMBERSIH KATA KUNCI (HEMAT TOKEN & AKURAT) ---
function extractKeywords(text) {
    // Hapus kata-kata basa-basi biar Tavily fokus ke inti
    const stopWords = ["halo", "hai", "flora", "tolong", "coba", "cariin", "carikan", "info", "tentang", "dong", "apa", "itu", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "nggak", "tidak", "mah", "sih", "kok", "gmna", "bagaimana", "jelaskan", "sebutkan"];
    
    // Ubah ke lowercase, pecah jadi array, filter kata sampah
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    
    // Kalau hasilnya kosong (misal user cuma ketik "halo flora"), balikin teks asli aja
    return keywords.length > 2 ? keywords : text;
}

// --- HELPER: DETEKSI APAKAH PERLU SEARCH? (HEMAT KUOTA TAVILY) ---
function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

const promptFlora = (context) => `
Kamu adalah Flora AI. Gaya: Santai, singkat, jelas, bahasa Indonesia.
Gunakan HTML <b> untuk poin penting.
${context ? `[DATA WEB REAL-TIME]:\n${context}\n\nPakai data ini untuk menjawab!` : ""}
`;

// --- 1. SEARCH WEB (TAVILY) ---
async function searchWeb(rawQuery) {
    if (!tavilyKey) return "";
    
    // Step 1: Bersihkan query biar jadi kata kunci doang
    const cleanQuery = extractKeywords(rawQuery);
    console.log(`🔎 Searching: "${cleanQuery}" (Asli: "${rawQuery.substring(0, 20)}...")`);

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                api_key: tavilyKey, 
                query: cleanQuery, // Kirim kata kunci yang sudah dipadatkan
                max_results: 1,    // Cukup 1 hasil terbaik biar hemat & cepat
                include_answer: true 
            })
        });
        const data = await res.json();
        return data.answer || data.results.map(r => r.content).join("\n");
    } catch (e) { 
        console.log("Tavily Skip/Limit:", e.message); 
        return ""; // Kalau limit habis, lanjut tanpa search
    }
}

// --- 2. GEMINI (ENGINE UTAMA) ---
async function runGemini(message, imageBase64, searchContext, history) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");
    const modelName = "gemini-1.5-flash"; // Paling stabil
    
    for (const key of geminiKeys) {
        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: promptFlora(searchContext) });

            if (imageBase64) {
                const base64Data = imageBase64.split(",")[1];
                const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                const result = await model.generateContent([message || "Jelaskan", { inlineData: { data: base64Data, mimeType } }]);
                return { text: result.response.text(), label: "Flora (Gemini)" };
            } else {
                const chat = model.startChat({
                    history: history.map(m => ({ role: m.role==='model'?'model':'user', parts: [{ text: m.content.replace(/<[^>]*>/g, '') }] })),
                });
                const result = await chat.sendMessage(message);
                return { text: result.response.text(), label: "Flora (Gemini)" };
            }
        } catch (e) { continue; }
    }
    throw new Error("Gemini Limit");
}

// --- 3. MISTRAL & GROQ (FETCH MANUAL) ---
async function runBackup(provider, message, imageBase64, searchContext) {
    const isGroq = provider === 'groq';
    const key = isGroq ? groqKey : mistralKey;
    const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.mistral.ai/v1/chat/completions";
    const model = isGroq 
        ? (imageBase64 ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile")
        : (imageBase64 ? "pixtral-12b-2409" : "mistral-small-latest");

    if (!key) throw new Error(`${provider} Key Missing`);

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: promptFlora(searchContext) },
                { role: "user", content: imageBase64 ? [{type:"text", text:message}, {type:"image_url", [isGroq ? "image_url" : "imageUrl"]: isGroq ? {url:imageBase64} : imageBase64}] : message }
            ]
        })
    });
    if (!res.ok) throw new Error(`${provider} Error`);
    const data = await res.json();
    return data.choices[0].message.content;
}

// --- HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history = [], message, image } = req.body;
        
        // LOGIKA HEMAT KUOTA TAVILY:
        // 1. Tidak ada gambar (Visual biasanya ga butuh search teks)
        // 2. Pesan cukup panjang (>3 huruf)
        // 3. Mengandung kata kunci trigger (siapa, kapan, harga, dll)
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            // Batasi waktu search max 2.5 detik biar ga timeout
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 2500));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        try {
            const { text, label } = await runGemini(message, image, searchContext, history);
            return res.json({ reply: `<b>[${label}]</b><br>${text}` });
        } catch (e1) {
            try {
                // Groq dulu (lebih cepet)
                const text = await runBackup('groq', message, image, searchContext);
                return res.json({ reply: `<b>[Flora Backup]</b><br>${text}` });
            } catch (e2) {
                try {
                    // Terakhir Mistral
                    const text = await runBackup('mistral', message, image, searchContext);
                    return res.json({ reply: `<b>[Flora Last]</b><br>${text}` });
                } catch (e3) {
                    return res.json({ reply: "Semua sistem sibuk." });
                }
            }
        }
    } catch (err) {
        return res.json({ reply: `Error: ${err.message}` });
    }
};
