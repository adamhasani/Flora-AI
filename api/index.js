const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================
// 1. SETUP - VERCEL ENVIRONMENT
// ==========================================
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

const nvidiaKey = getCleanKey(process.env.NVIDIA_API_KEY);
const geminiKeys = (process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(k => k);
const mistralKey = getCleanKey(process.env.MISTRAL_API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);
const tavilyKey = getCleanKey(process.env.TAVILY_API_KEY);

// ==========================================
// 2. HELPER: CLEANING & PROMPT BARU
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

function needsSearch(text) {
    const triggers = ["siapa", "kapan", "dimana", "berapa", "harga", "terbaru", "berita", "cuaca", "skor", "pemenang", "jadwal", "rilis", "2025", "2026", "iphone", "samsung", "presiden", "gempa", "banjir"];
    return triggers.some(t => text.toLowerCase().includes(t));
}

// PROMPT BARU: Detail tapi On-Point
const promptFlora = (context) => `
Kamu adalah Flora AI.
Gaya bahasa: Gaul, asik layaknya teman ngobrol, tapi tetap cerdas dan informatif.

ATURAN PENTING:
1. LANGSUNG KE INTI JAWABAN. Jangan pakai basa-basi pembuka kaku.
2. BERIKAN PENJELASAN LENGKAP. Jika butuh detail (coding, teori, atau cerita), jelaskan dengan komprehensif. Jangan pelit kata.
3. WAJIB: JANGAN PERNAH MENGGUNAKAN BINTANG DUA (**). Gunakan tag HTML <b>...</b> untuk menebalkan kata.
4. Gunakan bullet points (-) jika perlu membuat list agar rapi.
5. DILARANG MENULIS LABEL NAMA SENDIRI di awal kalimat (Seperti [Flora] dll).

${context ? `[DATA REFERENSI]:\n${context}\n\nJawab dengan luwes dan detail berdasarkan data ini!` : ""}
`;

// ==========================================
// 3. SEARCH ENGINE (TAVILY)
// ==========================================
async function searchWeb(rawQuery) {
    if (!tavilyKey) return "";
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: rawQuery, max_results: 1, include_answer: true })
        });
        const data = await res.json();
        return data.answer || (data.results && data.results[0] ? data.results[0].content : "");
    } catch (e) { return ""; }
}

// ==========================================
// 4. CORE STREAMING ENGINE (Nvidia, Mistral, Groq)
// ==========================================
async function streamOpenAICompatible(url, key, model, messages, label, onChunk) {
    if (!key) throw new Error(`No Key for ${label}`);
    
    const response = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.6, max_tokens: 4096 })
    });

    if (!response.ok) throw new Error(`${label} Error ${response.status}`);
    
    onChunk(`<b>[${label}]</b><br>`); // Kirim label jika koneksi sukses

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim() !== "");
        
        for (const line of lines) {
            if (line.includes("[DONE]")) return;
            if (line.startsWith("data: ")) {
                try {
                    const parsed = JSON.parse(line.replace(/^data: /, ""));
                    if (parsed.choices[0].delta?.content) {
                        onChunk(parsed.choices[0].delta.content.replace(/\*\*/g, "")); 
                    }
                } catch (e) {}
            }
        }
    }
}

// ==========================================
// 5. GEMINI STREAMING ENGINE
// ==========================================
async function streamGemini(message, imageBase64, searchContext, history, onChunk) {
    if (geminiKeys.length === 0) throw new Error("No Gemini Keys");

    const chatHistory = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: cleanReply(msg.content) }] 
    }));

    for (const key of geminiKeys) {
        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: promptFlora(searchContext) });
            
            if (imageBase64) {
                 // Mode Gambar (Non-stream sementara buat gambar)
                 const base64Data = imageBase64.split(",")[1];
                 const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                 const result = await model.generateContent([message || "Jelaskan", { inlineData: { data: base64Data, mimeType } }]);
                 onChunk(`<b>[FLORA GEMINI]</b><br>${result.response.text()}`);
                 return;
            } else {
                 // Mode Teks (Streaming)
                 const chat = model.startChat({ history: chatHistory });
                 const result = await chat.sendMessageStream(message);
                 onChunk(`<b>[FLORA GEMINI]</b><br>`);
                 for await (const chunk of result.stream) {
                     onChunk(chunk.text().replace(/\*\*/g, ""));
                 }
                 return;
            }
        } catch (e) { continue; }
    }
    throw new Error("Gemini Gagal.");
}

// ==========================================
// 6. CONTROLLER UTAMA (SSE STREAMING)
// ==========================================
module.exports = async (req, res) => {
    // CORS & Preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Set Headers Khusus Streaming (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { history = [], message, image } = req.body;
    
    // Fungsi pembungkus untuk mengirim potongan teks ke Frontend
    const writeChunk = (text) => {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
    };

    try {
        // --- STEP 1: SEARCH ---
        let searchContext = "";
        if (!image && message && needsSearch(message)) {
            const searchPromise = searchWeb(message);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(""), 3000));
            searchContext = await Promise.race([searchPromise, timeoutPromise]);
        }

        // --- STEP 2: SIAPKAN FORMAT PESAN ---
        let messages = [{ role: "system", content: promptFlora(searchContext) }];
        if (image) {
            messages.push({
                role: "user",
                content: [{ type: "text", text: message || "Jelaskan" }, { type: "image_url", image_url: { url: image } }]
            });
        } else {
            messages = messages.concat(getCleanHistory(history));
            messages.push({ role: "user", content: message });
        }

        // --- STEP 3: CASCADE STREAMING AI ---
        try {
            const modelNvidia = image ? "meta/llama-3.2-90b-vision-instruct" : "qwen/qwen3.5-122b-a10b";
            await streamOpenAICompatible("https://integrate.api.nvidia.com/v1/chat/completions", nvidiaKey, modelNvidia, messages, "FLORA NVIDIA", writeChunk);
        } catch (e0) {
            console.log("Nvidia Skip:", e0.message);
            try {
                await streamGemini(message, image, searchContext, history, writeChunk);
            } catch (e1) {
                console.log("Gemini Skip:", e1.message);
                try {
                    const modelMistral = image ? "pixtral-12b-2409" : "mistral-small-latest";
                    await streamOpenAICompatible("https://api.mistral.ai/v1/chat/completions", mistralKey, modelMistral, messages, "FLORA MISTRAL", writeChunk);
                } catch (e2) {
                    console.log("Mistral Skip:", e2.message);
                    try {
                        const modelGroq = image ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";
                        await streamOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", groqKey, modelGroq, messages, "FLORA GROQ", writeChunk);
                    } catch (e3) {
                        writeChunk("<b>[SYSTEM]</b><br>Maaf, semua server AI sedang sibuk.");
                    }
                }
            }
        }
    } catch (err) {
        writeChunk(`<b>[ERROR]</b><br>${err.message}`);
    } finally {
        // Beri tahu frontend kalau stream sudah selesai
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
};
