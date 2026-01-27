const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. DEFINISI PROMPT ---
const promptNatural = `
    Nama kamu Flora. Asisten AI cerdas, santai, dan membantu.
    Jika menerima gambar, analisislah dengan detail.
`;

const promptStrictHTML = `
    Nama kamu Flora. Asisten AI cerdas & rapi.
    ATURAN FORMATTING (WAJIB HTML): Gunakan <b>tebal</b>, <br> baris baru, <ul><li>daftar</li></ul>. JANGAN Markdown.
`;

// --- 3. HELPER: PEMBERSIH ---
const cleanResponse = (text) => {
    if (!text) return "";
    return text.replace(/```html/g, '').replace(/```/g, '').replace(/\n/g, "<br>").trim();
};

// --- 4. HELPER BARU: NORMALISASI HISTORY (Kunci Fitur Gambar) ---

// A. Untuk Groq & Anabot (Hanya Teks, HAPUS DATA GAMBAR)
const normalizeForTextOnly = (history) => {
    // Kita map ulang history, pastikan hanya properti 'role' dan 'content' yang diambil.
    // Properti 'imageData' (base64) akan otomatis terbuang di sini.
    return history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role, // Standarisasi role
        content: msg.content // Hanya ambil teksnya
    }));
};

// B. Untuk Gemini (Support Multimodal/Gambar)
const normalizeForGemini = (history) => {
    return history.map(msg => {
        let role = msg.role === 'assistant' ? 'model' : msg.role;
        let parts = [{ text: msg.content }]; // Bagian teks dasar

        // JIKA ADA DATA GAMBAR DI PESAN USER
        // (Frontend akan mengirim properti 'imageData' berisi base64)
        if (msg.role === 'user' && msg.imageData) {
            // Hapus prefix data:image/...;base64, agar tinggal datanya saja
            const base64Data = msg.imageData.split(',')[1];
            parts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg" // Asumsikan jpeg/png, Gemini cukup pintar menanganinya
                }
            });
        }
        return { role, parts };
    });
};


// --- 5. FUNGSI EKSEKUTOR ---

// A. ANABOT (Teks Only)
async function runAnabot(history) {
    // Pakai normalisasi Teks Only
    const cleanHist = normalizeForTextOnly(history);
    const conversationText = cleanHist.map(msg => {
        const roleName = msg.role === 'user' ? 'User' : 'Flora';
        const cleanContent = msg.content.replace(/<[^>]*>/g, ''); // Hapus HTML di input
        return `${roleName}: ${cleanContent}`;
    }).join('\n');

    const finalPrompt = `[System: ${promptNatural}]\n\nRiwayat Chat:\n${conversationText}\n\nFlora:`;
    const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    let replyText = data.data?.result?.text || data.result?.text || data.result || (typeof data === 'string' ? data : "");
    if (!replyText || replyText.includes("Tidak dapat menemukan pola")) throw new Error("Respon Anabot Kosong");
    return cleanResponse(replyText);
}

// B. GROQ (Teks Only)
async function runGroq(history) {
    if (!groqKey) throw new Error("API Key GROQ Kosong!");
    // Pakai normalisasi Teks Only (Gambar dibuang di sini)
    const cleanHistory = normalizeForTextOnly(history);
    
    const messagesGroq = [{ role: "system", content: promptStrictHTML }, ...cleanHistory];
    const chatCompletion = await groq.chat.completions.create({
        messages: messagesGroq,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6, max_tokens: 1024,
    });
    return cleanResponse(chatCompletion.choices[0]?.message?.content);
}

// C. GEMINI (Multimodal - Bisa Gambar)
async function runGemini(history) {
    if (!geminiKey) throw new Error("API Key GEMINI Kosong!");

    // Pakai normalisasi Gemini (Gambar diproses di sini)
    const geminiHistoryFull = normalizeForGemini(history);
    
    // Pisahkan pesan terakhir untuk dikirim via sendMessage
    const lastMessageStruct = geminiHistoryFull.pop(); 
    const historyContext = geminiHistoryFull;

    const modelGemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: promptNatural });
    const chat = modelGemini.startChat({ history: historyContext });
    
    // Kirim array 'parts' yang bisa berisi teks DAN gambar
    const result = await chat.sendMessage(lastMessageStruct.parts);
    return cleanResponse(result.response.text());
}

// --- 6. MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Frontend sekarang mengirim struktur: { role, content, imageData (opsional) }
        const { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : 'anabot';

        let result = "";
        let label = "";

        try {
            if (selectedModel === 'groq') {
                result = await runGroq(history);
                label = "⚡ Groq";
            } 
            else if (selectedModel === 'gemini') {
                result = await runGemini(history);
                // Cek apakah pesan terakhir user ada gambarnya untuk label
                const lastUserMsg = history[history.length-1];
                label = lastUserMsg.imageData ? "🧠 Gemini Vision" : "🧠 Gemini";
            } 
            else {
                result = await runAnabot(history);
                label = "🚙 Anabot";
            }
            
            return res.json({ reply: `<b>[${label}]</b><br>${result}` });

        } catch (modelError) {
            console.error(`Error ${selectedModel}:`, modelError);
            return res.json({ reply: `<b>[❌ ${selectedModel.toUpperCase()} ERROR]</b><br>${modelError.message}` });
        }

    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
