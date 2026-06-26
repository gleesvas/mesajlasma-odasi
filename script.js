// Firebase Ayarları
const firebaseConfig = {
    apiKey: "AIzaSyDQqjQ14nDWzbCzC7abJDOVIxYWbp9qosI",
    authDomain: "yurt-paneli.firebaseapp.com",
    databaseURL: "https://yurt-paneli-default-rtdb.firebaseio.com",
    projectId: "yurt-paneli",
    storageBucket: "yurt-paneli.firebasestorage.app",
    messagingSenderId: "779236033369",
    appId: "1:779236033369:web:9e3eccdb03e8fa9ae78248",
    measurementId: "G-H48TZ0E9S2"
};

// Firebase'i Başlat
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Global Değişkenler
let currentUser = "";
let currentUserImgB64 = "https://via.placeholder.com/150?text=👤";
let activeReplyId = null;
let typingTimeout = null;
let lastMessageCount = 0; // Ses bildirimi takibi için sayı sayacı

document.addEventListener("DOMContentLoaded", () => {
    checkUserIdentity();
    loadMessages();
    listenTypingStatus();
    trackOnlinePresence();

    // Enter tuşu dinleyicisi
    document.getElementById("message-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    // Sayfaya tıklanınca açık menüleri ve pop-upları kapatma mekanizması
    document.addEventListener("click", (e) => {
        if (!e.target.closest('.emoji-dropdown-container')) {
            document.getElementById("emoji-menu").style.display = "none";
        }
        if (!e.target.closest('.msg-options-container')) {
            document.querySelectorAll(".action-menu").forEach(el => el.remove());
        }
    });
});

// 1. Giriş ve Profil Yönetimi
function checkUserIdentity() {
    const savedUser = localStorage.getItem("chat_user_name_v4");
    const savedImg = localStorage.getItem("chat_user_img_v4");

    if (savedUser && savedImg) {
        currentUser = savedUser;
        currentUserImgB64 = savedImg;

        document.getElementById("user-badge").innerText = currentUser;
        document.getElementById("user-avatar-img").src = currentUserImgB64;

        // Kullanıcı kaydedildikten sonra online durumunu bildir
        announceOnlinePresence();
    } else {
        document.getElementById("auth-modal").style.display = "flex";
    }
}

function previewUploadedFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        currentUserImgB64 = e.target.result;
        document.getElementById("modal-avatar-preview").src = currentUserImgB64;
    };
    reader.readAsDataURL(file);
}

function saveProfile() {
    const nameInput = document.getElementById("username-input").value.trim();
    if (nameInput === "") {
        alert("Lütfen geçerli bir isim giriniz!");
        return;
    }

    currentUser = nameInput;
    localStorage.setItem("chat_user_name_v4", currentUser);
    localStorage.setItem("chat_user_img_v4", currentUserImgB64);

    document.getElementById("user-badge").innerText = currentUser;
    document.getElementById("user-avatar-img").src = currentUserImgB64;

    document.getElementById("auth-modal").style.display = "none";

    announceOnlinePresence();
}

// 2. Çevrimiçi (Online) Takip Sistemi
function announceOnlinePresence() {
    if (!currentUser) return;
    const userStatusRef = database.ref('online_users_v4/' + currentUser);

    // Tarayıcı sekmesi kapandığında veya bağlantı koptuğunda otomatik Firebase'den silinme emri
    userStatusRef.onDisconnect().remove();

    // Mevcut duruma ekleme yap
    userStatusRef.set({
        name: currentUser,
        img: currentUserImgB64,
        lastActive: Date.now()
    });
}

let activeUsersData = {};
function trackOnlinePresence() {
    database.ref('online_users_v4').on('value', (snapshot) => {
        const data = snapshot.val();
        activeUsersData = data ? data : {};
        const count = Object.keys(activeUsersData).length;
        document.getElementById("online-count-text").innerText = `${count} Çevrimiçi`;
    });
}

function toggleOnlineUsersModal(show) {
    const modal = document.getElementById("online-users-modal");
    if (!show) {
        modal.style.display = "none";
        return;
    }

    const container = document.getElementById("online-users-container");
    container.innerHTML = "";

    Object.values(activeUsersData).forEach(user => {
        const row = document.createElement("div");
        row.className = "online-user-row";
        row.innerHTML = `
            <img src="${user.img}" alt="${user.name}">
            <span>${user.name}</span>
        `;
        container.appendChild(row);
    });

    modal.style.display = "flex";
}

// 3. "Yazıyor..." (Typing) Sistemi
function handleTypingStatus() {
    if (!currentUser) return;

    database.ref('typing_v4/' + currentUser).set(true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        database.ref('typing_v4/' + currentUser).remove();
    }, 2000); // Kullanıcı 2 saniye yazı yazmayı bırakırsa işareti kaldır
}

function listenTypingStatus() {
    database.ref('typing_v4').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        const typingList = Object.keys(data).filter(name => name !== currentUser);

        const bar = document.getElementById("typing-indicator-bar");
        if (typingList.length > 0) {
            document.getElementById("typing-text").innerText = `${typingList.join(", ")} yazıyor...`;
            bar.style.display = "flex";
        } else {
            bar.style.display = "none";
        }
    });
}

// 4. Medya (Fotoğraf) Gönderme Sistemi
function sendMediaMessage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Img = e.target.result;
        pushMessageToFirebase("", base64Img); // Yazısız, sadece görselli mesaj gönderimi
    };
    reader.readAsDataURL(file);
    event.target.value = ""; // Inputu sıfırla
}

// 5. Mesaj Gönderme Çekirdeği
function sendMessage() {
    const inputField = document.getElementById("message-input");
    const messageText = inputField.value.trim();

    if (messageText === "") return;

    pushMessageToFirebase(messageText, null);
    inputField.value = "";
    cancelReply();

    // Yazıyor durumunu hemen temizle
    if (currentUser) database.ref('typing_v4/' + currentUser).remove();
}

function pushMessageToFirebase(text, sharedImg) {
    const id = Date.now().toString();
    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    const newMessage = {
        id: id,
        sender: currentUser,
        userImg: currentUserImgB64,
        text: text,
        sharedImg: sharedImg, // Eklenen medya url/b64 alanı
        time: timeString,
        replyTo: activeReplyId ? activeReplyId : null,
        reactions: {}
    };

    database.ref('messages_v4/' + id).set(newMessage);
}

// 6. Canlı Mesaj Dinleme ve Bildirim Sesi Kontrolü
let globalMessages = {};
function loadMessages() {
    database.ref('messages_v4').on('value', (snapshot) => {
        const data = snapshot.val();
        globalMessages = data ? data : {};
        const messagesList = Object.values(globalMessages);

        // Ses Efekti Kontrolü: Eğer yeni mesaj geldiyse ve son mesaj benden çıkmadıysa çal
        if (messagesList.length > lastMessageCount && lastMessageCount > 0) {
            const lastMsg = messagesList[messagesList.length - 1];
            if (lastMsg.sender !== currentUser) {
                const sound = document.getElementById("notification-sound");
                if (sound) sound.play().catch(e => console.log("Ses çalma izni engellendi: ", e));
            }
        }
        lastMessageCount = messagesList.length;

        renderMessages(messagesList);
    });
}

function renderMessages(messagesList) {
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "";

    messagesList.forEach(msg => {
        const wrapper = document.createElement("div");
        const isMe = msg.sender === currentUser;

        wrapper.className = isMe ? "msg-wrapper me" : "msg-wrapper other";
        wrapper.id = `msg-${msg.id}`;

        // Yanıt mekanizması kontrolü
        let replyHtml = "";
        if (msg.replyTo && globalMessages[msg.replyTo]) {
            const parentMsg = globalMessages[msg.replyTo];
            const displayParentText = parentMsg.text || "📷 Fotoğraf";
            replyHtml = `
                <div class="msg-replied-inside">
                    <small><b>${parentMsg.sender}</b></small>
                    <p style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${displayParentText}</p>
                </div>
            `;
        }

        // Medya (Paylaşılan Fotoğraf) kontrolü
        let mediaHtml = "";
        if (msg.sharedImg) {
            mediaHtml = `<img src="${msg.sharedImg}" class="shared-chat-img" alt="Paylaşılan Görsel" onclick="viewProfileImage('${msg.sharedImg}')">`;
        }

        // Seçenek Tetikleyici
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "msg-options-container";
        optionsContainer.innerHTML = `
            <button class="msg-options-trigger" onclick="openActionMenu(event, '${msg.id}', '${msg.sender}', ${isMe})">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        `;

        // Ana Balon ve Reaksiyon Kutularının Birleşimi
        const mainBox = document.createElement("div");
        mainBox.className = "msg-main-box";

        const senderNameHtml = isMe ? "" : `<strong>${msg.sender}</strong><br>`;

        // Reaksiyonların (Tepkilerin) Listelenmesi
        let reactionsHtml = "";
        if (msg.reactions) {
            const counts = {};
            Object.values(msg.reactions).forEach(emoji => {
                counts[emoji] = (counts[emoji] || 0) + 1;
            });

            if (Object.keys(counts).length > 0) {
                reactionsHtml = `<div class="reactions-row-container">`;
                Object.entries(counts).forEach(([emoji, count]) => {
                    reactionsHtml += `
                        <div class="reaction-pill" onclick="addReactionDirect('${msg.id}', '${emoji}')">
                            <span>${emoji}</span>
                            <span class="reaction-count">${count}</span>
                        </div>
                    `;
                });
                reactionsHtml += `</div>`;
            }
        }

        mainBox.innerHTML = `
            <div class="msg-bubble">
                ${replyHtml}
                ${senderNameHtml}
                ${msg.text}
                ${mediaHtml}
            </div>
            <div class="msg-meta">${msg.time}</div>
            ${reactionsHtml}
        `;

        const userPhotoUrl = msg.userImg || "https://via.placeholder.com/150?text=👤";
        const avatarImg = document.createElement("img");
        avatarImg.className = "msg-avatar-img";
        avatarImg.src = userPhotoUrl;
        avatarImg.onclick = function () { viewProfileImage(userPhotoUrl); };

        wrapper.appendChild(avatarImg);
        wrapper.appendChild(mainBox);
        wrapper.appendChild(optionsContainer);

        chatMessagesDiv.appendChild(wrapper);
    });

    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// 7. 3 Nokta & Reaksiyon Seçim Menüsü Yönetimi
function openActionMenu(event, id, sender, isMe) {
    event.stopPropagation();
    document.querySelectorAll(".action-menu").forEach(el => el.remove());

    const triggerBtn = event.currentTarget;
    const menu = document.createElement("div");
    menu.className = "action-menu";

    // Reaksiyon Hızlı Çubuğu Üst Kısım
    let reactionSelectorHtml = `
        <div class="reaction-selector-bar">
            <span onclick="toggleReaction('${id}', '👍')">👍</span>
            <span onclick="toggleReaction('${id}', '❤️')">❤️</span>
            <span onclick="toggleReaction('${id}', '😂')">😂</span>
            <span onclick="toggleReaction('${id}', '😮')">😮</span>
            <span onclick="toggleReaction('${id}', '😢')">😢</span>
            <span onclick="toggleReaction('${id}', '🎉')">🎉</span>
        </div>
    `;

    const msgText = globalMessages[id] ? (globalMessages[id].text || "Fotoğraf") : "Mesaj";
    let actionButtonsHtml = `<button onclick="startReply('${id}', '${sender}', '${msgText.replace(/'/g, "\\'")}')"><i class="fa-solid fa-reply"></i> Yanıtla</button>`;

    if (isMe) {
        actionButtonsHtml += `<button class="delete-btn" onclick="deleteMessage('${id}')"><i class="fa-solid fa-trash"></i> Sil</button>`;
    }

    menu.innerHTML = reactionSelectorHtml + actionButtonsHtml;
    triggerBtn.parentElement.appendChild(menu);
}

// Reaksiyon Ekleme / Kaldırma Mantığı
function toggleReaction(msgId, emoji) {
    if (!currentUser) return;
    const reactionRef = database.ref(`messages_v4/${msgId}/reactions/${currentUser}`);

    reactionRef.get().then((snapshot) => {
        if (snapshot.exists() && snapshot.val() === emoji) {
            // Eğer zaten aynı emojiyi bıraktıysa geri çek (sil)
            reactionRef.remove();
        } else {
            // Farklı bir emoji bıraktıysa veya hiç bırakmadıysa ekle/güncelle
            reactionRef.set(emoji);
        }
    });
}

function addReactionDirect(msgId, emoji) {
    toggleReaction(msgId, emoji);
}

function deleteMessage(id) {
    database.ref('messages_v4/' + id).remove();
}

// 8. Diğer Genel Fonksiyonlar (Aç/Kapat)
function viewProfileImage(src) {
    const modal = document.getElementById("image-viewer-modal");
    const img = document.getElementById("viewer-img");
    img.src = src;
    modal.style.display = "flex";
}

function closeImageViewer() {
    document.getElementById("image-viewer-modal").style.display = "none";
}

function toggleEmojiMenu() {
    const menu = document.getElementById("emoji-menu");
    menu.style.display = menu.style.display === "none" ? "grid" : "none";
}

function appendEmoji(emoji) {
    const input = document.getElementById("message-input");
    input.value += emoji;
    input.focus();
    document.getElementById("emoji-menu").style.display = "none";
    handleTypingStatus(); // Emoji eklemek de yazma statüsünü tetikler
}

function startReply(id, sender, text) {
    activeReplyId = id;
    const bar = document.getElementById("reply-preview-bar");
    document.getElementById("reply-target-user").innerText = `${sender} yanıtlanıyor`;
    document.getElementById("reply-target-text").innerText = text;
    bar.style.display = "flex";
    document.getElementById("message-input").focus();
}

function cancelReply() {
    activeReplyId = null;
    document.getElementById("reply-preview-bar").style.display = "none";
}