const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
    // 1. SETUP HEADER (Wajib untuk Web)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle Preflight Request
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Pastikan Method POST
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        // Ambil riwayat chat dari Web
        const { history } = req.body;

        // Validasi data
        if (!history || !Array.isArray(history)) {
            return res.status(400).json({ error: 'Data history tidak valid' });
        }

        // 2. DAPATKAN TANGGAL HARI INI (Supaya Bot Sadar Waktu)
        const today = new Date().toLocaleDateString('id-ID', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });

        // 3. SETTING KEPRIBADIAN & ATURAN
        const systemPrompt = {
            role: "system",
            content: `Nama kamu Flora. Kamu asisten AI yang cerdas, to-the-point, dan rapi.
            
            INFORMASI WAKTU:
            Hari ini adalah: ${today}.
            (Gunakan informasi ini jika user bertanya tentang waktu/kejadian terkini).
            
            ATURAN FORMATTING (WAJIB DIPATUHI):
            1. Gunakan HTML Tags untuk format teks:
               - <b>Teks Tebal</b> untuk Judul/Poin Penting.
               - <br> untuk ganti baris.
               - <ul><li>Poin 1</li><li>Poin 2</li></ul> untuk daftar.
               - <p>Paragraf</p> untuk penjelasan.
            2. JANGAN gunakan Markdown (*, #, -) karena akan berantakan di web.
            3. Jawablah dengan struktur yang jelas.
            
            ATURAN JAWABAN:
            - Jika ditanya TERJEMAHAN: Langsung jawab artinya. (Contoh: "Inggrisnya makan apa?" -> "Eat.")
            - Jika ditanya fakta terbaru: Cek tanggal hari ini dulu.`
        };

        // 4. GABUNGKAN (System Prompt + Chat User)
        const finalMessages = [systemPrompt, ...history];

        // 5. KIRIM KE GROQ (Llama 3)
        const chatCompletion = await groq.chat.completions.create({
            messages: finalMessages,
            model: "llama-3.3-70b-versatile",
            temperature: 0.6, // Fokus & Tidak Halu
            max_tokens: 1024,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Maaf, Flora lagi ngelamun (Server Error).";

        return res.status(200).json({ reply: reply });

    } catch (error) {
        console.error("Error:", error);
        return res.status(200).json({ reply: `⚠️ Error Sistem: ${error.message}` });
    }
};
