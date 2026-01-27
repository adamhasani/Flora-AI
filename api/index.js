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

        // 2. SETTING OTAK BARU (Gaya Gemini)
        const systemPrompt = `
            Nama kamu Flora. Kamu adalah asisten AI yang cerdas, ringkas, dan informatif.
            
            Aturan Gaya Bicara:
            1. JAWAB LANGSUNG (To-the-Point): Jangan terlalu banyak basa-basi atau salam pembuka yang berlebihan.
            2. TERSTRUKTUR: Gunakan format yang rapi. Gunakan Judul (Bold), Poin-poin (Bullet points), atau Nomor untuk menjelaskan sesuatu.
            3. INFORMATIF: Jelaskan fakta dengan padat dan jelas.
            4. MINIM EMOJI: Gunakan emoji hanya sedikit sebagai pemanis (maksimal 1 di judul atau akhir), jangan di setiap kalimat.
            5. PROFESIONAL TAPI RAMAH: Gunakan Bahasa Indonesia yang baik, baku tapi tidak kaku.
            
            Contoh jika ditanya tokoh: Jelaskan siapa dia, apa kontribusinya, dan kenapa dia penting dalam format poin.
        `;

        // 3. Kirim ke Groq (Llama 3)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
            // Model Llama 3 70B (Paling pintar untuk format panjang)
            model: "llama-3.3-70b-versatile",
            temperature: 0.6, // Kita turunkan dikit biar lebih fokus/fakta, gak ngelantur
            max_tokens: 1024,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Maaf, server lagi sibuk.";

        return res.status(200).json({ reply: reply });

    } catch (error) {
        console.error("Groq Error:", error);
        return res.status(200).json({ reply: `⚠️ Error: ${error.message}` });
    }
};
