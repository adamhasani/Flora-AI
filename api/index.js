const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const Groq = require("groq-sdk");

// --- 1. SETUP KUNCI ---
const getCleanKey = (key) => key ? key.replace(/\\n/g, "").trim() : "";
const geminiKey = getCleanKey(process.env.GEMINI_API_KEY || process.env.API_KEY);
const groqKey = getCleanKey(process.env.GROQ_API_KEY);

const genAI = new GoogleGenerativeAI(geminiKey || "dummy");
const groq = new Groq({ apiKey: groqKey || "dummy" });

// --- 2. DEFINISI PROMPT (DIPERKUAT) ---
const promptStrictHTML = `
    Nama kamu Flora. Kamu asisten AI cerdas & santai.
    ATURAN WAJIB:
    1. Gunakan format HTML: <b>tebal</b>, <br> baris baru, <ul><li>untuk daftar.
    2. JANGAN PERNAH gunakan simbol bintang (**) atau simbol Markdown lainnya.
    3. Jawab langsung ke inti masalah (On-Point).
`;

// --- 3. HELPER: PEMBERSIH & PENERJEMAH MARKDOWN (SOLUSI BINTANG) ---
const cleanResponse = (text) => {
    if (!text) return "";
    let clean = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Ubah **teks** jadi <b>teks</b>
        .replace(/\*(.*?)\*/g, '<i>$1</i>')     // Ubah *teks* jadi <i>teks</i>
        .replace(/^- (.*$)/gim, '<li>$1</li>')  // Ubah baris (-) jadi list item
        .replace(/```html/g, '').replace(/```/g, '')
        .replace(/\\n/g, "<br>").replace(/\n/g, "<br>")
        .trim();
    
    // Bungkus <li> kalau ada
    if (clean.includes('<li>')) clean = `<ul>${clean}</ul>`;
    
    return clean;
};

// --- HELPER NORMALISASI (Agar Gak Error Pas Pindah Model) ---
const getCleanHistory = (history) => {
    return history.map(msg => ({
        // Samakan role: user tetap user, sisanya (model/assistant) jadi assistant
        role: (msg.role === 'model' || msg.role === 'assistant') ? 'assistant' : 'user',
        // Buang tag HTML agar model baru gak bingung baca riwayat
        content: msg.content.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim()
    }));
};

// --- 4. FUNGSI EKSEKUTOR ---

// A. ANABOT
async function runAnabot(history) {
    const cleanHist = getCleanHistory(history);
    const conversationText = cleanHist.map(m => `${m.role === 'user' ? 'User' : 'Flora'}: ${m.content}`).join('\n');

    const finalPrompt = `${promptStrictHTML}\n\nRiwayat Chat:\n${conversationText}\n\nFlora:`;
    const apiUrl = `https://anabot.my.id/api/ai/geminiOption?prompt=${encodeURIComponent(finalPrompt)}&type=Chat&apikey=freeApikey`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    let replyText = data.data?.result?.text || data.result?.text || data.result || "";
    if (!replyText || replyText.includes("Tidak dapat menemukan pola")) throw new Error("Anabot Gagal");

    return cleanResponse(replyText);
}

// B. GROQ
async function runGroq(history) {
    if (!groqKey) throw new Error("API Key GROQ Kosong!");
    const cleanHist = getCleanHistory(history);
    
    const messagesGroq = [{ role: "system", content: promptStrictHTML }, ...cleanHist];
    const chatCompletion = await groq.chat.completions.create({
        messages: messagesGroq,
        model: "llama-3.3-70b-versatile",
        temperature: 0.6,
    });
    return cleanResponse(chatCompletion.choices[0]?.message?.content);
}

// C. GEMINI
async function runGemini(history) {
    if (!geminiKey) throw new Error("API Key GEMINI Kosong!");
    const modelGemini = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: promptStrictHTML });

    const cleanHist = getCleanHistory(history).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    
    const lastMsg = cleanHist.pop().parts[0].text;
    const chat = modelGemini.startChat({ history: cleanHist });
    const result = await chat.sendMessage(lastMsg);
    return cleanResponse(result.response.text());
}

// --- 5. MAIN HANDLER ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history, model } = req.body;
        const selectedModel = model ? model.toLowerCase() : 'anabot';

        let result = "";
        let label = "Flora AI"; // Default Label
        
        try {
            if (selectedModel === 'groq') {
                result = await runGroq(history);
                label = "Flora AI ⚡";
            } 
            else if (selectedModel === 'gemini') {
                result = await runGemini(history);
                label = "Flora AI 🧠";
            } 
            else {
                result = await runAnabot(history);
                label = "Flora AI 🚙";
            }
            
            return res.json({ reply: `<b>[${label}]</b><br>${result}` });

        } catch (modelError) {
            return res.json({ 
                reply: `<b>[❌ Flora Error]</b><br>Maaf Adam, sepertinya sistem ${selectedModel} sedang sibuk. Coba model lain ya!` 
            });
        }

    } catch (sysError) {
        return res.status(500).json({ reply: `System Crash: ${sysError.message}` });
    }
};
