const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
    // 1. Setup Header agar bisa diakses dari Web
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle Preflight Request
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Pastikan Method POST
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        // Menerima 'history' (Daftar percakapan), bukan cuma satu pesan
        const { history } = req.body;

        // Validasi data
        if (!history || !Array.isArray(history)) {
            return res.status(400).json({ error: 'Data history tidak valid' });
        }

        // 2. Setting Kepribadian & Aturan Format
        const systemPrompt = {
            role: "system",
            content: `Nama kamu Flora. Kamu asisten AI yang cerdas, to-the-point, dan rapi.
            
            ATURAN FORMATTING (WAJIB):
            1. Gunakan HTML Tags agar jawaban rapi di web:
               - Gunakan <b>Teks Tebal</b> untuk Judul atau Poin Penting.
               - Gunakan <br> untuk ganti baris.
               - Gunakan <ul><li>Poin 1</li><li>Poin 2</li></ul> untuk daftar/poin-poin.
               - Gunakan <p>Paragraf</p> untuk penjelasan panjang.
            2. JANGAN gunakan Markdown (*, #, -) karena akan terlihat berantakan.
            3. Jawablah dengan struktur yang jelas (Intro -> Poin-poin -> Kesimpulan).
            4. Ingat konteks percakapan sebelumnya.`
        };

        // 3. Gabungkan System Prompt + Riwayat Chat User
        // Ini kuncinya biar dia ingat omongan sebelumnya
        const finalMessages = [systemPrompt, ...history];

        // 4. Kirim ke Groq (Llama 3)
        const chatCompletion = await groq.chat.completions.create({
            messages: finalMessages,
            model: "llama-3.3-70b-versatile", // Model Cerdas & Gratis
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
