// ==========================================
// 1. SETUP - VERCEL ENVIRONMENT
// ==========================================
// Taruh key Nvidia kamu di Environment Variables Vercel dengan nama NVIDIA_API_KEY
const nvidiaKey = process.env.NVIDIA_API_KEY;
const tavilyKey = process.env.TAVILY_API_KEY ? process.env.TAVILY_API_KEY.replace(/\\n/g, "").trim() : "";

// ==========================================
// 2. HELPER: CLEANING SERVICE (FIX LABEL & FORMAT)
// ==========================================
function cleanReply(text) {
    if (typeof text !== 'string') return text;
    let clean = text;
    clean = clean.replace(/^<b>\[.*?\]<\/b><br>/i, ""); 
    clean = clean.replace(/^\[Flora.*?\]/i, "").replace(/^Flora:/i, ""); 
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    return clean.trim();
}

function getCleanHistory(history) {
    return history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: cleanReply(msg.content || "") 
    }));
}

function extractKeywords(text) {
    const stopWords = ["halo", "hai", "flora", "tolong", "cariin", "info", "tentang", "apa", "yang", "di", "ke", "dari", "buat", "saya", "aku", "bisa", "ga", "jelaskan", "sebutkan", "update", "berita"];
    let keywords = text.toLowerCase().split(/\s+/)
        .filter(word => !stopWords.includes(word) && word.length > 2)
        .join(" ");
    return keywords.length > 2 ? keywords : text;
}

function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gempa", "banjir", "skor", "film", "bioskop"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

const promptFlora = (context) => `
Kamu adalah Flora AI.
Gaya: Singkat, Padat, Jelas, & Gaul.

ATURAN PENTING:
1. JAWABAN HARUS ON POINT. Jangan kebanyakan basa-basi pembuka/penutup.
2. JANGAN GUNAKAN FORMAT MARKDOWN BINTANG DUA (**). Gunakan tag HTML <b>...</b> untuk menebalkan kata.
3. Jika membuat list, gunakan bullet points (-) yang rapi.
4. DILARANG MENULIS LABEL NAMA SENDIRI (Seperti [Flora] dll).

${context ? `[DATA TERBARU]:\n${context}\n\nJawab to-the-point berdasarkan data ini!` : ""}
`;

// ==========================================
// 3. SEARCH ENGINE (TAVILY)
// ==========================================
async function searchWeb(rawQuery) {
    if (!tavilyKey) return "";
    const cleanQuery = extractKeywords(rawQuery);
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: cleanQuery, max_results: 1, include_answer: true })
        });
        const data = await res.json();
        return data.answer || (data.results && data.results[0] ? data.results[0].content : "");
    } catch (e) { return ""; }
}

// ==========================================
// 4. TEST ENGINE: NVIDIA (QWEN & LLAMA VISION)
// ==========================================
async function runNvidia(message, imageBase64, searchContext, history) {
    if (!nvidiaKey) throw new Error("No Nvidia Key in Environment Variables");

    const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    const label = "FLORA NVIDIA";
    
    // Kalau ada gambar pakai model Vision, kalau teks doang pakai Qwen
    const model = imageBase64 ? "meta/llama-3.2-90b-vision-instruct" : "qwen/qwen3.5-122b-a10b";

    let messages = [{ role: "system", content: promptFlora(searchContext) }];

    if (imageBase64) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: message || "Tolong jelaskan gambar ini" },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
    } else {
        messages = messages.concat(getCleanHistory(history));
        messages.push({ role: "user", content: message });
    }

    const payload = {
        model: model,
        messages: messages,
        max_tokens: 4096,
        temperature: 0.60,
        top_p: 0.95,
        stream: false,
    };

    const res = await fetch(invokeUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${nvidiaKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Nvidia API Error: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    return { text: data.choices[0].message.content, label };
}

// ==========================================
// 5. CONTROLLER UTAMA
// ==========================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { history = [], message, image } = req.body;

    try {
        // --- STEP 1: SEARCH ---
        let searchContext = "";
        if (!image && message && message.length > 3 && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 3000));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        let result = { text: "", label: "" };

        // --- STEP 2: JALANKAN NVIDIA API ---
        try {
            result = await runNvidia(message, image, searchContext, history);
        } catch (e1) {
            console.log("⚠️ Nvidia Error:", e1.message);
            return res.json({ reply: `System Error (Nvidia): ${e1.message}` });
        }

        // --- STEP 3: FINAL CLEANING ---
        const cleanText = cleanReply(result.text);

        return res.json({ 
            reply: `<b>[${result.label}]</b><br>${cleanText}` 
        });

    } catch (err) {
        return res.json({ reply: `System Error: ${err.message}` });
    }
};
