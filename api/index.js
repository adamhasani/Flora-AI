const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async (req, res) => {
  // Izin CORS biar bisa diakses dari frontend mana aja
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  // Handle preflight request (penting buat browser)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { message } = req.body;

    // --- SETTING KEPRIBADIAN DI SINI ---
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: "Nama kamu Flora. Jawab dengan singkat, gaul, dan pakai bahasa Indonesia santai."
    });

    // --- LOGIC ROUTER (Tempat nambah fitur nanti) ---
    // Cek apakah user minta fitur lain?
    if (message.toLowerCase().includes("/menu")) {
        return res.json({ reply: "Menu: 1. Chat biasa\n2. (Segera hadir) Buat Gambar" });
    }

    // Kalau chat biasa, kirim ke Gemini
    const result = await model.generateContent(message);
    const response = result.response.text();

    return res.status(200).json({ reply: response });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ reply: "Duh, otakku error nih. Coba lagi ya!" });
  }
};
