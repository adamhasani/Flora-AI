const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI (DENGAN PEMBERSIH SPASI) ---
// Biar kodingan gak manja kalau ada spasi nyelip
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";

// Prioritas ambil dari GEMINI_API_KEY (sesuai Vercel kamu), kalau gak ada baru cari API_KEY
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. DEFINISI PROMPT (Sesuai Selera Kamu) ---
const promptNatural = `
    Nama kamu Flora. Kamu asisten AI yang cerdas, santai, dan to-the-point.
    Jawablah pertanyaan dengan jelas dan ringkas.
`;

const promptStrictHTML = `
    Nama kamu Flora. Asisten AI cerdas & rapi.
    ATURAN FORMATTING (WAJIB HTML):
    1. Gunakan <b>Teks Tebal</b> untuk poin penting.
    2. Gunakan <br> untuk ganti baris.
    3. Gunakan <ul><li>List</li></ul> untuk daftar.
    4. JANGAN gunakan Markdown (* atau #).
`;

// --- 3. PEMBERSIH OUTPUT ---
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/```html/g, '').replace(/```/g, '')
        .replace(/\\n/g, "<br>").replace(/\n/g, "<br>")
        .replace(/\\"/g, '"').replace(/\\u003c/g, "<")
        .replace(/\\u003e/g, ">").replace(/\\/g, "")
        .trim();
    if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
    return clean;
};

// --- 4. FUNGSI EKSEKUTOR (MATI YA MATI, GAK ADA OPER-OPERAN) ---

// A. ANABOT
async function runAnabot(history) {
    const conversationText = history.map(msg => `${msg.role==='user'?'User':'Flora'}: ${msg.content}`).join('\n');
    const finalPrompt = `[System: ${promptNatural}]\n\nRiwayat Chat:\n${conversationText}\n\nFlora:`;
    const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    let replyText = "";
    if (data.data?.result?.text) replyText = data.data.result.text;
    else if (data.result?.text) replyText = data.result.text;
    else if (data.result) replyText = data.result;
    else replyText = typeof data === 'string' ? data : "";

    if (!replyText || replyText.includes("Tidak dapat menemukan pola")) {
        throw new Error("Respon Anabot Kosong/Gagal");
    }
    return cleanResponse(replyText);
}

// B. GROQ
async function runGroq(history) {
    if (!groqKey) throw new Error("API Key GROQ Kosong di Vercel!");
    
    const messagesGroq = [{ role: "system", content: promptStrictHTML }, ...history];
    const chatCompletion = await groq.chat.completions.create({
        messages: messagesGroq,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
        max_tokens: 1024,
    });
    return cleanResponse(chatCompletion.choices[0]?.message?.content);
}

// C. GEMINI
async function runGemini(history) {
    if (!geminiKey) throw new Error("API Key GEMINI Kosong di Vercel!");

    // Safety Settings (Wajib biar gak error 'Harmful Content')
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    const modelGemini = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: promptNatural,
        safetySettings: safetySettings
    });

    const geminiHistory = history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] }));
    const lastMsg = geminiHistory.pop().parts[0].text;
    const chat = modelGemini.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(lastMsg);
    return cleanResponse(result.response.text());
}

// --- 5. MAIN HANDLER (STRICT MODE) ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history, model } = req.body;
        // Default ke Anabot kalau user gak milih
        const selectedModel = model ? model.toLowerCase() : 'anabot'; 

        // LOGIKA SWITCH TANPA BACKUP
        // Kalau error, langsung lempar errornya ke user biar user tau.
        
        let result = "";
        
        try {
            if (selectedModel === 'groq') {
                result = await runGroq(history);
                result = `<b>[⚡ Groq]</b><br>${result}`; // Label biar tau ini Groq
            } 
            else if (selectedModel === 'gemini') {
                result = await runGemini(history);
                result = `<b>[🧠 Gemini]</b><br>${result}`; // Label biar tau ini Gemini
            } 
            else {
                // Default Anabot
                result = await runAnabot(history);
                result = `<b>[🚙 Anabot]</b><br>${result}`; // Label biar tau ini Anabot
            }
            
            // Kirim Jawaban Sukses
            return res.json({ reply: result });

        } catch (modelError) {
            // INI YANG KAMU MINTA:
            // Tampilkan error mentah-mentah sesuai model yang dipilih.
            console.error(`Error pada ${selectedModel}:`, modelError);
            return res.json({ 
                reply: `<b>[❌ ${selectedModel.toUpperCase()} ERROR]</b><br>${modelError.message}<br><br><i>(Mode Backup dimatikan, silakan pilih model lain manual)</i>` 
            });
        }

    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
