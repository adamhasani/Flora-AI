const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Pesan kosong' });

        // 2. INSTRUKSI FORMAT HTML (PENTING!)
        // Kita suruh AI pakai tag HTML biar browser HP kamu bisa bacanya rapi.
        const systemPrompt = `
            Nama kamu Flora. Kamu asisten AI yang cerdas, to-the-point, dan rapi.
            
            ATURAN FORMATTING (WAJIB DIPATUHI):
            1. Jangan gunakan Markdown (seperti *, #, -). Tampilan itu jelek di web ini.
            2. Gunakan HTML TAGS untuk memformat jawabanmu:
               - Gunakan <b>Teks Tebal</b> untuk kata kunci atau sub-judul.
               - Gunakan <br> untuk baris baru.
               - Gunakan <ul><li>Poin 1</li><li>Poin 2</li></ul> untuk membuat daftar poin.
               - Gunakan <p>Paragraf</p> untuk penjelasan.
            3. Gaya Bicara: Informatif, Terstruktur, dan Mirip Wikipedia/Gemini.
            
            Contoh Output yang Benar:
            <b>Ada Lovelace</b> adalah programmer pertama.<br><br>
            <b>Kontribusi Utama:</b>
            <ul>
                <li>Menulis algoritma pertama.</li>
                <li>Visioner komputer.</li>
            </ul>
        `;

        // 3. Kirim ke Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.5, // Lebih rendah biar nurut aturan format
            max_tokens: 1024,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Maaf, server error.";

        return res.status(200).json({ reply: reply });

    } catch (error) {
        console.error("Groq Error:", error);
        return res.status(200).json({ reply: `⚠️ Error: ${error.message}` });
    }
};
