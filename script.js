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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// Global Değişkenler
let currentUser = "";
let currentUserImgB64 = "https://via.placeholder.com/150?text=👤";
let isAdmin = false;
let userUniqueId = "";
let activeReplyId = null;
let typingTimeout = null;
let lastMessageCount = 0;
let searchQuery = "";

document.addEventListener("DOMContentLoaded", () => {
    loadSavedTheme();
    checkUserIdentity();
    listenTypingStatus();
    trackOnlinePresence();

    document.getElementById("message-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest('.emoji-dropdown-container')) document.getElementById("emoji-menu").style.display = "none";
        if (!e.target.closest('.msg-options-container')) document.querySelectorAll(".action-menu").forEach(el => el.remove());
    });
});

// Gelişmiş Özellik 1: Görsel Sıkıştırma Motoru (Canvas Tabanlı Hızlandırıcı)
function compressImage(base64Str, maxWidth = 600, maxHeight = 600) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2webgl') || canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Kaliteyi %60'a düşürerek kaliteden ödün vermeden hızı uçuruyoruz
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            resolve(compressedBase64);
        };
    });
}

// Tema Yönetimi
function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById("theme-toggle-btn");

    if (body.classList.contains("light-mode")) {
        body.classList.replace("light-mode", "dark-mode");
        themeBtn.innerHTML = `<i class="fa-solid fa-sun" style="color: #f59e0b;"></i>`;
        localStorage.setItem("chat_theme_v5", "dark");
    } else {
        body.classList.replace("dark-mode", "light-mode");
        themeBtn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
        localStorage.setItem("chat_theme_v5", "light");
    }
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem("chat_theme_v5") || "light";
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (savedTheme === "dark") {
        document.body.className = "dark-mode";
        themeBtn.innerHTML = `<i class="fa-solid fa-sun" style="color: #f59e0b;"></i>`;
    } else {
        document.body.className = "light-mode";
        themeBtn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
    }
}

// Kimlik ve Ban Kontrolleri
function checkUserIdentity() {
    const savedUser = localStorage.getItem("chat_user_name_v5");
    const savedImg = localStorage.getItem("chat_user_img_v5");
    const savedUid = localStorage.getItem("chat_user_uid_v5");
    const savedIsAdmin = localStorage.getItem("chat_user_is_admin_v5");

    if (savedUser && savedImg && savedUid) {
        currentUser = savedUser;
        currentUserImgB64 = savedImg;
        userUniqueId = savedUid;
        isAdmin = (savedIsAdmin === "true");

        checkIfBanned(userUniqueId);
    } else {
        document.getElementById("auth-modal").style.display = "flex";
    }
}

function checkIfBanned(uid) {
    database.ref('banned_v5/' + uid).get().then((snapshot) => {
        if (snapshot.exists()) {
            alert("Bu sohbet odasından kalıcı olarak banlandınız!");
            localStorage.clear();
            window.location.reload();
        } else {
            document.getElementById("auth-modal").style.display = "none";
            document.getElementById("user-badge").innerText = currentUser;
            document.getElementById("user-avatar-img").src = currentUserImgB64;
            announceOnlinePresence();
            loadMessages();
        }
    }).catch(() => {
        document.getElementById("auth-modal").style.display = "none";
        loadMessages();
    });
}

function previewUploadedFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        // Profil fotoğrafını anında optimize edip küçültüyoruz
        currentUserImgB64 = await compressImage(e.target.result, 150, 150);
        document.getElementById("modal-avatar-preview").src = currentUserImgB64;
    };
    reader.readAsDataURL(file);
}

function saveProfile() {
    let nameInput = document.getElementById("username-input").value.trim();
    if (nameInput === "") {
        alert("Lütfen geçerli bir isim giriniz!");
        return;
    }

    if (nameInput === "admin123") {
        currentUser = "Sistem Yöneticisi";
        isAdmin = true;
    } else {
        currentUser = nameInput;
        isAdmin = false;
    }

    userUniqueId = "user_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

    localStorage.setItem("chat_user_name_v5", currentUser);
    localStorage.setItem("chat_user_img_v5", currentUserImgB64);
    localStorage.setItem("chat_user_uid_v5", userUniqueId);
    localStorage.setItem("chat_user_is_admin_v5", isAdmin ? "true" : "false");

    document.getElementById("auth-modal").style.display = "none";

    // Gelişmiş Özellik 3: Hoş Geldin Sistem Mesajı Gönderimi
    pushSystemMessage(`${currentUser} sohbete katıldı 👋`);
    checkIfBanned(userUniqueId);
}

// Çevrimiçi Takibi ve Ayrıldı Ayrışması
function announceOnlinePresence() {
    if (!userUniqueId) return;
    const userStatusRef = database.ref('online_users_v5/' + userUniqueId);

    // Gelişmiş Özellik 3: Kullanıcı sekmesini kapattığında Sistem Ayrıldı mesajı düşsün
    userStatusRef.onDisconnect().remove(() => {
        pushSystemMessage(`${currentUser} odadan ayrıldı 🚪`);
    });

    userStatusRef.set({
        uid: userUniqueId,
        name: currentUser,
        img: currentUserImgB64,
        isAdmin: isAdmin
    });
}

let activeUsersData = {};
function trackOnlinePresence() {
    database.ref('online_users_v5').on('value', (snapshot) => {
        activeUsersData = snapshot.val() || {};
        const count = Object.keys(activeUsersData).length;
        document.getElementById("online-count-text").innerText = `${count} Çevrimiçi`;
    });
}

function toggleOnlineUsersModal(show) {
    const modal = document.getElementById("online-users-modal");
    if (!show) { modal.style.display = "none"; return; }
    const container = document.getElementById("online-users-container");
    container.innerHTML = "";

    Object.values(activeUsersData).forEach(user => {
        const row = document.createElement("div");
        row.className = "online-user-row";
        const roleText = user.isAdmin ? " [Admin]" : "";
        row.innerHTML = `<img src="${user.img}"><span>${user.name}${roleText}</span>`;
        container.appendChild(row);
    });
    modal.style.display = "flex";
}

// "Yazıyor..." Durumu
function handleTypingStatus() {
    if (!userUniqueId) return;
    database.ref('typing_v5/' + userUniqueId).set(currentUser);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        database.ref('typing_v5/' + userUniqueId).remove();
    }, 2000);
}

function listenTypingStatus() {
    database.ref('typing_v5').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        const typingList = [];
        Object.entries(data).forEach(([uid, name]) => {
            if (uid !== userUniqueId) typingList.push(name);
        });
        const bar = document.getElementById("typing-indicator-bar");
        if (typingList.length > 0) {
            document.getElementById("typing-text").innerText = `${typingList.join(", ")} yazıyor...`;
            bar.style.display = "flex";
        } else { bar.style.display = "none"; }
    });
}

// Okundu Bilgisi
function markMessagesAsRead(messagesList) {
    messagesList.forEach(msg => {
        if (msg.senderUid && msg.senderUid !== userUniqueId && (!msg.reads || !msg.reads[userUniqueId])) {
            database.ref(`messages_v5/${msg.id}/reads/${userUniqueId}`).set(true);
        }
    });
}

// Mesajları Yükleme
let globalMessages = {};
function loadMessages() {
    database.ref('messages_v5').limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        globalMessages = data ? data : {};
        const messagesList = Object.values(globalMessages);

        markMessagesAsRead(messagesList);

        if (messagesList.length > lastMessageCount && lastMessageCount > 0) {
            const lastMsg = messagesList[messagesList.length - 1];
            if (lastMsg.senderUid && lastMsg.senderUid !== userUniqueId) {
                document.getElementById("notification-sound").play().catch(() => { });
            }
        }
        lastMessageCount = messagesList.length;

        renderMessages(messagesList);
    });
}

// Sohbet İçi Arama
function toggleSearchBox() {
    const input = document.getElementById("search-input");
    if (input.style.display === "none") {
        input.style.display = "inline-block";
        input.focus();
    } else {
        input.style.display = "none";
        input.value = "";
        searchQuery = "";
        renderMessages(Object.values(globalMessages));
    }
}

function filterMessages() {
    searchQuery = document.getElementById("search-input").value.toLowerCase().trim();
    renderMessages(Object.values(globalMessages));
}

// Mesaj Ekrana Çizme (Render) ve Swipe To Reply Entegrasyonu
function renderMessages(messagesList) {
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "";

    messagesList.forEach(msg => {
        if (searchQuery !== "" && msg.text && !msg.text.toLowerCase().includes(searchQuery)) return;

        // EĞER SİSTEM MESAJIYSA FARKLI RENDER ET
        if (msg.isSystem) {
            const sysWrapper = document.createElement("div");
            sysWrapper.className = "system-msg-wrapper";
            sysWrapper.innerText = msg.text;
            chatMessagesDiv.appendChild(sysWrapper);
            return;
        }

        const wrapper = document.createElement("div");
        const isMe = msg.senderUid === userUniqueId;

        wrapper.className = isMe ? "msg-wrapper me" : "msg-wrapper other";
        wrapper.id = `msg-${msg.id}`;

        // Gelişmiş Özellik 2: Swipe To Reply (Sürükleyerek Yanıtla) Dokunmatik Motoru
        let startX = 0;
        wrapper.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
        wrapper.addEventListener('touchmove', (e) => {
            let moveX = e.touches[0].clientX - startX;
            if (moveX > 0 && moveX < 80) { // Sadece sağa kaydırma
                wrapper.style.transform = `translateX(${moveX}px)`;
            }
        }, { passive: true });
        wrapper.addEventListener('touchend', (e) => {
            let endX = e.changedTouches[0].clientX;
            if (endX - startX > 60) { // 60px'den fazla kaydıysa yanıtla
                startReply(msg.id, msg.sender, msg.text || "Fotoğraf");
            }
            wrapper.style.transform = "translateX(0px)";
        });

        // Masaüstü fare ile sürükleme simülasyonu
        wrapper.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            const onMouseMove = (ev) => {
                let moveX = ev.clientX - startX;
                if (moveX > 0 && moveX < 80) wrapper.style.transform = `translateX(${moveX}px)`;
            };
            const onMouseUp = (ev) => {
                if (ev.clientX - startX > 60) startReply(msg.id, msg.sender, msg.text || "Fotoğraf");
                wrapper.style.transform = "translateX(0px)";
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        let replyHtml = "";
        if (msg.replyTo && globalMessages[msg.replyTo]) {
            const parentMsg = globalMessages[msg.replyTo];
            replyHtml = `
                <div class="msg-replied-inside">
                    <small><b>${parentMsg.sender}</b></small>
                    <p style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${parentMsg.text || "📷 Fotoğraf"}</p>
                </div>
            `;
        }

        let mediaHtml = msg.sharedImg ? `<img src="${msg.sharedImg}" class="shared-chat-img" onclick="viewProfileImage('${msg.sharedImg}')">` : "";

        let tickHtml = "";
        if (isMe) {
            const onlineCount = Object.keys(activeUsersData).length;
            const readCount = msg.reads ? Object.keys(msg.reads).length : 0;
            const isReadByEveryone = readCount >= (onlineCount - 1) && onlineCount > 1;

            if (isReadByEveryone) {
                tickHtml = `<i class="fa-solid fa-check-double tick-icon read"></i>`;
            } else {
                tickHtml = `<i class="fa-solid fa-check-double tick-icon"></i>`;
            }
        }

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "msg-options-container";
        optionsContainer.innerHTML = `
            <button class="msg-options-trigger" onclick="openActionMenu(event, '${msg.id}', '${msg.sender}', '${msg.senderUid}', ${isMe})">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        `;

        const mainBox = document.createElement("div");
        mainBox.className = "msg-main-box";
        const senderNameHtml = isMe ? "" : `<strong>${msg.sender}</strong><br>`;

        let reactionsHtml = "";
        if (msg.reactions) {
            const counts = {};
            Object.values(msg.reactions).forEach(emo => counts[emo] = (counts[emo] || 0) + 1);
            if (Object.keys(counts).length > 0) {
                reactionsHtml = `<div class="reactions-row-container">`;
                Object.entries(counts).forEach(([emo, cnt]) => {
                    reactionsHtml += `<div class="reaction-pill" onclick="toggleReaction('${msg.id}', '${emo}')"><span>${emo}</span><span class="reaction-count">${cnt}</span></div>`;
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
            <div class="msg-meta-row">
                <span class="msg-meta">${msg.time}</span>
                ${tickHtml}
            </div>
            ${reactionsHtml}
        `;

        const avatarImg = document.createElement("img");
        avatarImg.className = "msg-avatar-img";
        avatarImg.src = msg.userImg || "https://via.placeholder.com/150?text=👤";
        avatarImg.onclick = () => viewProfileImage(avatarImg.src);

        wrapper.appendChild(avatarImg);
        wrapper.appendChild(mainBox);
        wrapper.appendChild(optionsContainer);
        chatMessagesDiv.appendChild(wrapper);
    });

    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Menü ve Banlama Yetkileri
function openActionMenu(event, id, senderName, senderUid, isMe) {
    event.stopPropagation();
    document.querySelectorAll(".action-menu").forEach(el => el.remove());

    const triggerBtn = event.currentTarget;
    const menu = document.createElement("div");
    menu.className = "action-menu";

    let reactionSelectorHtml = `
        <div class="reaction-selector-bar">
            <span onclick="toggleReaction('${id}', '👍')">👍</span>
            <span onclick="toggleReaction('${id}', '❤️')">❤️</span>
            <span onclick="toggleReaction('${id}', '😂')">😂</span>
            <span onclick="toggleReaction('${id}', '😮')">😮</span>
            <span onclick="toggleReaction('${id}', '🎉')">🎉</span>
        </div>
    `;

    const msgText = globalMessages[id] ? (globalMessages[id].text || "Fotoğraf") : "Mesaj";
    let actionButtonsHtml = `<button onclick="startReply('${id}', '${senderName}', '${msgText.replace(/'/g, "\\'")}')"><i class="fa-solid fa-reply"></i> Yanıtla</button>`;

    if (isMe || isAdmin) {
        actionButtonsHtml += `<button class="delete-btn" onclick="deleteMessage('${id}')"><i class="fa-solid fa-trash"></i> Sil</button>`;
    }

    if (isAdmin && senderUid !== userUniqueId) {
        actionButtonsHtml += `<button class="ban-btn" onclick="banUser('${senderUid}', '${senderName}')"><i class="fa-solid fa-user-slash"></i> Kullanıcıyı Banla</button>`;
    }

    menu.innerHTML = reactionSelectorHtml + actionButtonsHtml;
    triggerBtn.parentElement.appendChild(menu);
}

function banUser(targetUid, targetName) {
    if (confirm(`${targetName} adlı kullanıcıyı odadan süresiz banlamak istiyor musunuz?`)) {
        database.ref('banned_v5/' + targetUid).set({
            bannedName: targetName,
            bannedBy: currentUser,
            timestamp: Date.now()
        });
        database.ref('online_users_v5/' + targetUid).remove();
        alert(`${targetName} başarıyla banlandı!`);
    }
}

function deleteMessage(id) { database.ref('messages_v5/' + id).remove(); }

function toggleReaction(msgId, emoji) {
    if (!userUniqueId) return;
    const ref = database.ref(`messages_v5/${msgId}/reactions/${userUniqueId}`);
    ref.get().then(snap => snap.exists() && snap.val() === emoji ? ref.remove() : ref.set(emoji));
}

// Gelişmiş Mesaj ve Optimize Medya Gönderimi
function sendMediaMessage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        // Gönderilen sohbet fotoğrafını anında sıkıştırıp öyle yüklüyoruz (Hızın anahtarı)
        const optimizedImg = await compressImage(e.target.result, 600, 600);
        pushMessageToFirebase("", optimizedImg);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
}

function sendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();
    if (text === "") return;
    pushMessageToFirebase(text, null);
    input.value = "";
    cancelReply();
    if (userUniqueId) database.ref('typing_v5/' + userUniqueId).remove();
}

function pushMessageToFirebase(text, sharedImg) {
    const id = Date.now().toString();
    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    database.ref('messages_v5/' + id).set({
        id: id,
        sender: currentUser,
        senderUid: userUniqueId,
        userImg: currentUserImgB64,
        text: text,
        sharedImg: sharedImg,
        time: timeString,
        replyTo: activeReplyId ? activeReplyId : null
    });
}

function pushSystemMessage(text) {
    const id = "sys_" + Date.now();
    database.ref('messages_v5/' + id).set({
        id: id,
        text: text,
        isSystem: true
    });
}

// Diğer Yardımcı Fonksiyonlar
function viewProfileImage(src) {
    const modal = document.getElementById("image-viewer-modal");
    const img = document.getElementById("viewer-img");
    img.src = src; modal.style.display = "flex";
}
function closeImageViewer() { document.getElementById("image-viewer-modal").style.display = "none"; }
function toggleEmojiMenu() {
    const menu = document.getElementById("emoji-menu");
    menu.style.display = menu.style.display === "none" ? "grid" : "none";
}
function appendEmoji(emoji) {
    const input = document.getElementById("message-input");
    input.value += emoji; input.focus();
    document.getElementById("emoji-menu").style.display = "none";
    handleTypingStatus();
}
function startReply(id, sender, text) {
    activeReplyId = id;
    document.getElementById("reply-target-user").innerText = `${sender} yanıtlanıyor`;
    document.getElementById("reply-target-text").innerText = text;
    document.getElementById("reply-preview-bar").style.display = "flex";
    document.getElementById("message-input").focus();
}
function cancelReply() {
    activeReplyId = null;
    document.getElementById("reply-preview-bar").style.display = "none";
}