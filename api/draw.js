// --- DRAW REQUEST (DITAMBAH TRANSLASI OTOMATIS) ---
async function sendDrawRequest(prompt) {
    const input = document.getElementById('user-input');
    const welcome = document.getElementById('welcome-screen');
    if(welcome) welcome.remove();

    // Pastikan session ada di DB
    if(!allSessions[currentSessionId]) {
        allSessions[currentSessionId] = { title: prompt, timestamp: Date.now(), messages: [] };
    }

    addBubble(`🎨 Gambarkan: ${prompt}`, 'user', null, false, true);
    input.value = "";
    
    // Tampilkan animasi loading
    const loadingId = addBubble("", 'bot', null, true, false);

    try {
        // --- LANGKAH 1: TRANSLASI (Dari kode api/draw.js kamu) ---
        let englishPrompt = prompt;
        
        try {
            // Menggunakan Google Translate API Gratis
            const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(prompt)}`;
            const transRes = await fetch(transUrl);
            const transData = await transRes.json();
            
            // Ambil hasil terjemahan
            if (transData && transData[0] && transData[0][0]) {
                englishPrompt = transData[0][0][0];
            }
        } catch (e) {
            console.warn("Gagal translate, pakai teks asli.");
            // Kalau gagal, pakai prompt asli
            englishPrompt = prompt; 
        }

        // --- LANGKAH 2: GENERATE GAMBAR (Pollinations AI) ---
        // Kita pakai prompt bahasa Inggris agar hasil gambarnya lebih akurat
        const encodedPrompt = encodeURIComponent(englishPrompt);
        const randomSeed = Math.floor(Math.random() * 1000000); 
        
        // URL langsung ke gambar
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&nologo=true`;

        // Preload gambar untuk memastikan sukses sebelum ditampilkan
        const img = new Image();
        img.onload = () => {
            // Hapus loading
            const loadingEl = document.getElementById(loadingId);
            if(loadingEl) loadingEl.remove();
            
            // Tampilkan gambar hasil (sebutin prompt Inggrisnya biar tahu)
            addBubble(`Nih hasilnya: <b>${englishPrompt}</b> ✨`, 'bot', imageUrl, false, true);
        };
        
        img.onerror = () => {
            document.getElementById(loadingId).innerHTML = `
                <div style="color:#ff6b6b; padding:10px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat gambar.
                </div>`;
        };

        // Mulai memuat gambar
        img.src = imageUrl;

    } catch (e) {
        document.getElementById(loadingId).innerHTML = `
            <div style="color:#ff6b6b; padding:10px;">
                <i class="fa-solid fa-triangle-exclamation"></i> Error: ${e.message}
            </div>`;
    }
}
