const Groq = require("groq-sdk");

// Inisialisasi
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const TAVILY_KEY = process.env.TAVILY_API_KEY; // Pastikan sudah diset di Vercel

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { history } = req.body;
        if (!history) return res.status(400).json({ error: 'No history' });

        // Ambil pertanyaan terakhir user
        const lastMessage = history[history.length - 1].content;

        // --- DETEKTOR BERITA (Router) ---
        // Cek apakah user nanya soal berita/fakta terkini?
        const keywords = ["siapa", "kapan", "dimana", "pemenang", "terbaru", "harga", "cuaca", "berita", "2024", "2025", "2026"];
        const isNewsQuestion = keywords.some(word => lastMessage.toLowerCase().includes(word));

        let contextInternet = "";

        // JIKA PERTANYAAN BERITA & ADA KUNCI TAVILY -> CARI DI INTERNET
        if (isNewsQuestion && TAVILY_KEY) {
            try {
                console.log("🔍 Sedang Googling via Tavily...");
                const response = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: TAVILY_KEY,
                        query: lastMessage,
                        search_depth: "basic",
                        include_answer: true,
                        max_results: 3
                    })
                });
                
                const data = await response.json();
                
                // Ambil ringkasan dari internet
                if (data.results) {
                    const texts = data.results.map(r => r.content).join("\n\n");
                    contextInternet = `\n[DATA DARI INTERNET]:\n${texts}\n\n(Gunakan data di atas untuk menjawab pertanyaan user)`;
                }
            } catch (err) {
                console.error("Gagal searching:", err);
            }
        }

        // --- TAHAP AKHIR: GROQ MENJAWAB ---
        // Kita kasih Groq: Instruksi + Data Internet (kalau ada) + Chat History
        const systemPrompt = {
            role: "system",
            content: `Nama kamu Flora. Kamu asisten AI yang cerdas.
            
            ATURAN:
            1. Jika ada [DATA DARI INTERNET], gunakan itu sebagai sumber kebenaran (Fakta Real-time).
            2. Gunakan format HTML (<b>, <br>, <ul>).
            3. Jawab to-the-point.
            ${contextInternet}` // <--- Data internet masuk sini
        };

        const finalMessages = [systemPrompt, ...history];

        const chatCompletion = await groq.chat.completions.create({
            messages: finalMessages,
            model: "llama-3.3-70b-versatile",
            temperature: 0.6,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Error.";

        return res.status(200).json({ reply: reply });

    } catch (error) {
        return res.status(500).json({ reply: `Error: ${error.message}` });
    }
};
