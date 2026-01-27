const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");

module.exports = async (req, res) => {
    // Header Standar
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // --- BAGIAN DIAGNOSA ---
        // Kita cek satu-satu, ada gak barangnya?
        const geminiVar = process.env.GEMINI_API_KEY;
        const apiVar = process.env.API_KEY; // Nama lama
        const groqVar = process.env.GROQ_API_KEY;

        let laporan = "<b>[🕵️ LAPORAN DETEKTIF]</b><br>Saya membongkar server Vercel dan menemukan:<br><ul>";

        // Cek GEMINI_API_KEY
        if (geminiVar) {
            laporan += `<li>GEMINI_API_KEY: <b style="color:green">✅ ADA</b> (Awal: ${geminiVar.substring(0, 5)}...)</li>`;
        } else {
            laporan += `<li>GEMINI_API_KEY: <b style="color:red">❌ KOSONG MELOMPONG</b></li>`;
        }

        // Cek API_KEY (Nama lama)
        if (apiVar) {
            laporan += `<li>API_KEY: <b style="color:green">✅ ADA</b> (Awal: ${apiVar.substring(0, 5)}...)</li>`;
        } else {
            laporan += `<li>API_KEY: <b style="color:red">❌ KOSONG</b></li>`;
        }

        // Cek GROQ
        if (groqVar) {
            laporan += `<li>GROQ_API_KEY: <b style="color:green">✅ ADA</b></li>`;
        } else {
            laporan += `<li>GROQ_API_KEY: <b style="color:red">❌ KOSONG</b></li>`;
        }

        laporan += "</ul><br>";

        // KESIMPULAN
        if (!geminiVar && !apiVar) {
            laporan += "<b>KESIMPULAN:</b><br>Kunci Gemini belum masuk ke sistem. <br>👉 <b>SOLUSI:</b> Pergi ke Vercel > Deployments > Klik titik tiga di deploy terakhir > <b>REDEPLOY</b>.";
        } else {
            laporan += "<b>KESIMPULAN:</b><br>Kunci terbaca! Kalau masih error, berarti kuncinya kadaluarsa atau salah copy.";
        }

        return res.json({ reply: laporan });

    } catch (err) {
        return res.status(500).json({ reply: `Error Sistem: ${err.message}` });
    }
};
