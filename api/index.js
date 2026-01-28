<script>
    // ============================================
    // 🧠 OTAK ROUTER CERDAS (FRONTEND)
    // ============================================

    // Daftar kata kunci yang memicu mode EDIT GAMBAR
    const editKeywords = [
        "ubah", "ganti", "jadi", "buat", "edit",
        "hapus", "tambahkan", "warnai", 
        "gaya", "style", "anime", "kartun", "realistik", "3d",
        "latar belakang", "background", "bgnya"
    ];

    // Fungsi untuk mendeteksi niat pengguna
    function detectIntent(text) {
        if (!text) return 'vision'; // Kalau cuma kirim gambar tanpa teks, anggap Vision
        
        const lowerText = text.toLowerCase();
        
        // Cek apakah ada SATU SAJA kata kunci edit di dalam teks
        const isEditRequest = editKeywords.some(keyword => lowerText.includes(keyword));

        if (isEditRequest) {
            return 'edit'; // Niatnya ngedit
        } else {
            return 'vision'; // Niatnya nanya/analisis
        }
    }

    // ============================================
    // VARIABEL GLOBAL & SETUP Awal
    // ============================================
    let chatHistory = [];
    let attachmentBase64 = null;
    // Default endpoint adalah chat biasa/vision
    let currentApiEndpoint = '/api/index'; 

    const messageInput = document.getElementById('message-input');
    const chatBox = document.getElementById('chat-box');
    const typingIndicator = document.getElementById('typing-indicator');
    const attachmentPreview = document.getElementById('attachment-preview');
    const previewImg = document.getElementById('preview-img');

    messageInput.addEventListener('keypress', (e) => { 
        if(e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); 
            sendMessage(); 
        } 
    });

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight > 200 ? 200 : textarea.scrollHeight) + 'px';
    }

    // --- FUNGSI LAMPIRAN GAMBAR ---
    function triggerFileInput() {
        document.getElementById('file-input').click();
    }

    function handleFileUpload(input) {
        const file = input.files[0];
        if (!file) return;
        
        // Validasi tipe file (hanya gambar)
        if (!file.type.startsWith('image/')) {
            alert("Hanya bisa mengirim file gambar (JPG, PNG, GIF).");
            input.value = ''; // Reset input
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            attachmentBase64 = e.target.result;
            previewImg.src = attachmentBase64;
            attachmentPreview.style.display = 'flex';
            // Beri tahu user bahwa kita siap menerima perintah
            messageInput.placeholder = "Contoh: 'Jelaskan ini' atau 'Ubah jadi anime'...";
        };
        reader.readAsDataURL(file);
    }

    function clearAttachment() {
        attachmentBase64 = null;
        document.getElementById('file-input').value = '';
        attachmentPreview.style.display = 'none';
        messageInput.placeholder = "Ketik pesan di sini...";
    }

    // --- FUNGSI CHAT UTAMA ---
    function addMessage(content, sender, isImage = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender === 'user' ? 'user-message' : 'bot-message'}`;
        
        if (isImage) {
            // Kalau responnya gambar hasil editan
            msgDiv.innerHTML = `<img src="${content}" class="rounded-lg max-w-full h-auto border-2 border-purple-500" alt="Generated Image">`;
        } else {
            // Kalau teks biasa
            msgDiv.innerHTML = content;
        }
        
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
        const message = messageInput.value.trim();
        // Tidak boleh kirim kalau kosong DAN tidak ada gambar
        if (!message && !attachmentBase64) return;

        // 1. Tampilkan pesan user di chat
        let displayMessage = message;
        if (attachmentBase64 && message) {
             displayMessage = `<img src="${attachmentBase64}" class="h-20 w-auto rounded mb-2 border border-gray-600"><br>${message}`;
        } else if (attachmentBase64 && !message) {
             displayMessage = `<img src="${attachmentBase64}" class="h-20 w-auto rounded border border-gray-600">`;
        }
        addMessage(displayMessage, 'user');

        messageInput.value = '';
        autoResize(messageInput);
        
        // Simpan gambar sementara sebelum dihapus clearAttachment
        const currentImage = attachmentBase64; 
        
        // ==========================================
        // 🤖 LOGIKA ROUTING (INTENT DETECTION)
        // ==========================================
        let loadingText = "Sedang mengetik...";
        currentApiEndpoint = '/api/index'; // Default Chat/Vision

        // HANYA CEK ROUTING JIKA ADA GAMBAR YANG DILAMPIRKAN
        if (currentImage) {
            const intent = detectIntent(message);
            
            if (intent === 'edit') {
                console.log(`[ROUTER] Niat terdeteksi: EDIT GAMBAR -> Arahkan ke /api/edit`);
                currentApiEndpoint = '/api/edit'; // Arahkan ke endpoint edit
                loadingText = "🎨 Sedang memproses gambar...";
            } else {
                console.log(`[ROUTER] Niat terdeteksi: VISION/ANALISIS -> Arahkan ke /api/index`);
                currentApiEndpoint = '/api/index'; // Tetap di endpoint utama
                loadingText = "👁️ Sedang melihat gambar...";
            }
        }
        // ==========================================

        // Tampilkan loading yang sesuai
        document.getElementById('typing-text').innerText = loadingText;
        typingIndicator.style.display = 'flex';
        chatBox.scrollTop = chatBox.scrollHeight;

        // Hapus preview setelah pesan terkirim
        clearAttachment();

        try {
            // Siapkan payload data
            const payload = {
                message: message,
                history: chatHistory // Kirim history chat
            };
            // Jika ada gambar, masukkan ke payload
            if (currentImage) {
                payload.image = currentImage;
            }

            // KIRIM KE ENDPOINT YANG SUDAH DITENTUKAN ROUTER
            const response = await fetch(currentApiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            typingIndicator.style.display = 'none';

            if (!response.ok) throw new Error(data.error || "Gagal menghubungi server.");

            // Cek apakah responnya gambar (untuk endpoint /api/edit) atau teks
            if (data.image_url) {
                // Jika server membalas dengan URL gambar (hasil edit)
                addMessage(data.image_url, 'bot', true); // true artinya ini pesan gambar
                chatHistory.push({ role: 'user', content: message || "[Mengirim Gambar untuk Edit]" });
                chatHistory.push({ role: 'model', content: `[Membuat Gambar: ${data.image_url}]` });
            } else {
                 // Jika server membalas dengan teks (chat/vision biasa)
                addMessage(data.reply, 'bot');
                // Update history chat normal
                if (message) chatHistory.push({ role: 'user', content: message });
                chatHistory.push({ role: 'model', content: data.reply });
            }

        } catch (error) {
            typingIndicator.style.display = 'none';
            addMessage(`⚠️ Error: ${error.message}`, 'bot');
            console.error(error);
        }
    }

    // Fitur Mobile: Toggle Sidebar
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar');

    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.remove('-translate-x-full');
    });

    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('translate-x-full');
        // Sedikit hack biar animasinya jalan di mobile
        setTimeout(() => { sidebar.classList.add('-translate-x-full'); }, 50);
    });
</script>
