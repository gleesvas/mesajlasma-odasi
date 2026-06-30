// Firebase Ayarları
const firebaseConfig = {
    apiKey: "AIzaSyDQqjQ14nDWzbCzC7abJDOVIxYWbp9qosI",
    authDomain: "yurt-paneli.firebaseapp.com",
    databaseURL: "https://yurt-paneli-default-rtdb.firebaseio.com",
    projectId: "yurt-paneli",
    storageBucket: "yurt-paneli.firebasestorage.app",
    messagingSenderId: "779236033369",
    appId: "1:779236033369:web:9e3eccdb03e8fa9ae78248"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();

// Global Değişkenler ve Oda Yapısı
let currentRoomId = localStorage.getItem("current_room_id") || "";
let roomCreatorUid = ""; // Odayı oluşturan kişinin UID'si
let currentUser = "";
let currentUserImgB64 = "https://via.placeholder.com/150?text=👤";
let userUniqueId = "";
let activeReplyId = null;
let typingTimeout = null;
let lastMessageCount = 0;
let searchQuery = "";
let allUsersPresences = {}; // Küresel çevrimiçi haritası

document.addEventListener("DOMContentLoaded", () => {
    if (!currentRoomId) { window.location.href = "index.html"; return; }
    loadSavedTheme();
    checkUserIdentity();
    listenTypingStatus();
    trackRoomMembersAndPresence();

    document.getElementById("message-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest('.emoji-dropdown-container')) document.getElementById("emoji-menu").style.display = "none";
        if (!e.target.closest('.msg-options-container')) document.querySelectorAll(".action-menu").forEach(el => el.remove());
    });
});

function compressImage(base64Str, maxWidth = 600, maxHeight = 600) {
    return new Promise((resolve) => {
        const img = new Image(); img.src = base64Str;
        img.onload = () => {
            let width = img.width; let height = img.height;
            if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
            else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
    });
}

// Odadan Çıkış (Lobiye Dönüş)
function leaveRoom() {
    if (userUniqueId && currentRoomId) {
        database.ref(`rooms_v5/${currentRoomId}/members/${userUniqueId}`).remove();
        database.ref(`rooms_v5/${currentRoomId}/presence/${userUniqueId}`).remove();
    }
    localStorage.removeItem("current_room_id");
    window.location.href = "index.html";
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

// Kimlik ve Oda Detay Kontrolü
function checkUserIdentity() {
    const savedUser = localStorage.getItem("chat_user_name_v5");
    const savedImg = localStorage.getItem("chat_user_img_v5");
    const savedUid = localStorage.getItem("chat_user_uid_v5");

    if (!savedUser || !savedImg || !savedUid) { window.location.href = "index.html"; return; }

    currentUser = savedUser;
    currentUserImgB64 = savedImg;
    userUniqueId = savedUid;

    // Oda Bilgilerini ve Kurucusunu Çekme
    database.ref('rooms_v5/' + currentRoomId).get().then((snapshot) => {
        if (!snapshot.exists()) {
            alert("Bu oda artık mevcut değil!");
            window.location.href = "index.html";
            return;
        }
        const roomData = snapshot.val();
        roomCreatorUid = roomData.creatorUid;
        document.getElementById("current-room-title").innerHTML = `<i class="fa-solid fa-hashtag" style="color: #3b82f6;"></i> ${roomData.name}`;

        checkIfBannedFromRoom();
    });
}

function checkIfBannedFromRoom() {
    database.ref(`rooms_v5/${currentRoomId}/banned/${userUniqueId}`).get().then((snapshot) => {
        if (snapshot.exists()) {
            alert("Bu odadan kurucu tarafından atıldınız (banlandınız)!");
            window.location.href = "index.html";
        } else {
            document.getElementById("user-badge").innerText = currentUser;
            document.getElementById("user-avatar-img").src = currentUserImgB64;
            announceRoomPresence();

            if (localStorage.getItem("just_logged_in") === "true") {
                pushSystemMessage(`${currentUser} sohbete katıldı 👋`);
                localStorage.removeItem("just_logged_in");
            }
            loadMessages();
        }
    });
}

// Odaya Özel Çevrimiçi ve Üye Listesi Yönetimi
function announceRoomPresence() {
    // Üye kaydı (Odadaki kalıcı üye listesi)
    database.ref(`rooms_v5/${currentRoomId}/members/${userUniqueId}`).set({
        uid: userUniqueId, name: currentUser, img: currentUserImgB64
    });

    // Anlık aktiflik kaydı
    const presenceRef = database.ref(`rooms_v5/${currentRoomId}/presence/${userUniqueId}`);
    presenceRef.onDisconnect().remove();
    presenceRef.set(true);

    // Odadan çıkış onDisconnect mekanizması
    database.ref(`rooms_v5/${currentRoomId}/messages/sys_disconnect_${userUniqueId}`).onDisconnect().set({
        id: 'sys_disconnect_' + userUniqueId,
        text: `${currentUser} odadan ayrıldı 🚪`,
        isSystem: true,
        orderTimestamp: Date.now() + 50
    });
}

function trackRoomMembersAndPresence() {
    // Odadaki anlık aktifleri dinle
    database.ref(`rooms_v5/${currentRoomId}/presence`).on('value', (snapshot) => {
        allUsersPresences = snapshot.val() || {};
        renderSidebarMembers();
    });

    // Odadaki toplam kayıtlı üyeleri dinle
    database.ref(`rooms_v5/${currentRoomId}/members`).on('value', (snapshot) => {
        const membersData = snapshot.val() || {};
        const container = document.getElementById("room-members-list");
        container.innerHTML = "";

        Object.values(membersData).forEach(member => {
            const isOnline = allUsersPresences[member.uid] ? true : false;
            const isCreator = member.uid === roomCreatorUid;

            const card = document.createElement("div");
            card.className = "member-card";

            card.innerHTML = `
                <div class="member-avatar-wrapper ${isOnline ? 'online' : ''}">
                    <img src="${member.img}">
                </div>
                <div class="member-name-info">
                    <span>${member.name}</span>
                    ${isCreator ? '<i class="fa-solid fa-crown crown-icon" title="Oda Kurucusu"></i>' : ''}
                </div>
            `;
            container.appendChild(card);
        });
    });

    // Kurucu tarafından atılma kontrolünü anlık dinle
    database.ref(`rooms_v5/${currentRoomId}/banned/${userUniqueId}`).on('value', (snapshot) => {
        if (snapshot.exists()) {
            alert("Bu odadan kurucu tarafından atıldınız!");
            window.location.href = "index.html";
        }
    });
}

function renderSidebarMembers() {
    // Aktiflik değiştikçe listeyi tetikler (On/Off görsel senkronizasyonu için)
}

// "Yazıyor..." Durumu (Odaya Özel)
function handleTypingStatus() {
    if (!userUniqueId) return;
    database.ref(`rooms_v5/${currentRoomId}/typing/${userUniqueId}`).set(currentUser);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        database.ref(`rooms_v5/${currentRoomId}/typing/${userUniqueId}`).remove();
    }, 2000);
}

function listenTypingStatus() {
    database.ref(`rooms_v5/${currentRoomId}/typing`).on('value', (snapshot) => {
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

// Mesajları Yükleme (Odaya Özel)
let globalMessages = {};
function loadMessages() {
    database.ref(`rooms_v5/${currentRoomId}/messages`).limitToLast(50).on('value', (snapshot) => {
        const data = snapshot.val();
        globalMessages = data ? data : {};

        const messagesList = Object.values(globalMessages).sort((a, b) => {
            return (a.orderTimestamp || 0) - (b.orderTimestamp || 0);
        });

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

// Mesaj Ekrana Çizme (Kurucu Yetkileri Entegre Edildi)
function renderMessages(messagesList) {
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "";

    const isAmIOwner = userUniqueId === roomCreatorUid; // Ben bu odanın kurucusu muyum?

    messagesList.forEach(msg => {
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

        let replyHtml = "";
        if (msg.replyTo && globalMessages[msg.replyTo]) {
            const parentMsg = globalMessages[msg.replyTo];
            replyHtml = `<div class="msg-replied-inside"><small><b>${parentMsg.sender}</b></small><p>${parentMsg.text || "📷 Fotoğraf"}</p></div>`;
        }

        let mediaHtml = msg.sharedImg ? `<img src="${msg.sharedImg}" class="shared-chat-img" onclick="viewProfileImage('${msg.sharedImg}')">` : "";

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "msg-options-container";
        optionsContainer.innerHTML = `
            <button class="msg-options-trigger" onclick="openActionMenu(event, '${msg.id}', '${msg.sender}', '${msg.senderUid}', ${isMe}, ${isAmIOwner})">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        `;

        const mainBox = document.createElement("div");
        mainBox.className = "msg-main-box";
        const senderNameHtml = isMe ? "" : `<strong>${msg.sender}</strong><br>`;

        mainBox.innerHTML = `
            <div class="msg-bubble">${replyHtml}${senderNameHtml}${msg.text}${mediaHtml}</div>
            <div class="msg-meta-row"><span class="msg-meta">${msg.time}</span></div>
        `;

        const avatarImg = document.createElement("img");
        avatarImg.className = "msg-avatar-img";
        avatarImg.src = msg.userImg || "https://via.placeholder.com/150?text=👤";

        wrapper.appendChild(avatarImg);
        wrapper.appendChild(mainBox);
        wrapper.appendChild(optionsContainer);
        chatMessagesDiv.appendChild(wrapper);
    });

    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Gelişmiş Kurucu Menüsü
function openActionMenu(event, id, senderName, senderUid, isMe, isAmIOwner) {
    event.stopPropagation();
    document.querySelectorAll(".action-menu").forEach(el => el.remove());

    const triggerBtn = event.currentTarget;
    const menu = document.createElement("div");
    menu.className = "action-menu";

    const msgText = globalMessages[id] ? (globalMessages[id].text || "Fotoğraf") : "Mesaj";
    let actionButtonsHtml = `<button onclick="startReply('${id}', '${senderName}', '${msgText.replace(/'/g, "\\'")}')"><i class="fa-solid fa-reply"></i> Yanıtla</button>`;

    // SİLME YETKİSİ: Mesaj benimse VEYA ben odanın kurucusuysam silebilir edebilirim
    if (isMe || isAmIOwner) {
        actionButtonsHtml += `<button class="delete-btn" onclick="deleteMessage('${id}')"><i class="fa-solid fa-trash"></i> Sil</button>`;
    }

    // ODADAN ATMA YETKİSİ: Eğer ben odanın kurucusuysam ve tıkladığım kişi ben değilsem onu atabilirim
    if (isAmIOwner && senderUid !== userUniqueId) {
        actionButtonsHtml += `<button class="ban-btn" onclick="kickUserFromRoom('${senderUid}', '${senderName}')"><i class="fa-solid fa-user-slash"></i> Odadan At</button>`;
    }

    menu.innerHTML = actionButtonsHtml;
    triggerBtn.parentElement.appendChild(menu);
}

// Kurucunun Birini Odadan Atma Fonksiyonu
function kickUserFromRoom(targetUid, targetName) {
    if (confirm(`${targetName} adlı üyeyi bu odadan atmak istiyor musunuz?`)) {
        database.ref(`rooms_v5/${currentRoomId}/banned/${targetUid}`).set(true);
        database.ref(`rooms_v5/${currentRoomId}/members/${targetUid}`).remove();
        database.ref(`rooms_v5/${currentRoomId}/presence/${targetUid}`).remove();
        pushSystemMessage(`Kurucu, ${targetName} kullanıcısını odadan attı.`);
    }
}

function deleteMessage(id) { database.ref(`rooms_v5/${currentRoomId}/messages/${id}`).remove(); }

// Mesaj Gönderme Motoru (Odaya Özel)
function sendMessage() {
    const input = document.getElementById("message-input");
    const text = input.value.trim();
    if (text === "") return;
    pushMessageToFirebase(text, null);
    input.value = "";
    cancelReply();
    if (userUniqueId) database.ref(`rooms_v5/${currentRoomId}/typing/${userUniqueId}`).remove();
}

function sendMediaMessage(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const optimizedImg = await compressImage(e.target.result, 600, 600);
        pushMessageToFirebase("", optimizedImg);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
}

function pushMessageToFirebase(text, sharedImg) {
    const id = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    database.ref(`rooms_v5/${currentRoomId}/messages/${id}`).set({
        id: id, sender: currentUser, senderUid: userUniqueId, userImg: currentUserImgB64,
        text: text, sharedImg: sharedImg, time: timeString, replyTo: activeReplyId ? activeReplyId : null,
        orderTimestamp: Date.now()
    });
}

function pushSystemMessage(text) {
    const id = "sys_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    database.ref(`rooms_v5/${currentRoomId}/messages/${id}`).set({ id: id, text: text, isSystem: true, orderTimestamp: Date.now() });
}

// Diğer Yardımcılar
function viewProfileImage(src) { document.getElementById("viewer-img").src = src; document.getElementById("image-viewer-modal").style.display = "flex"; }
function closeImageViewer() { document.getElementById("image-viewer-modal").style.display = "none"; }
function toggleEmojiMenu() { const menu = document.getElementById("emoji-menu"); menu.style.display = menu.style.display === "none" ? "grid" : "none"; }
function appendEmoji(emoji) { const input = document.getElementById("message-input"); input.value += emoji; input.focus(); document.getElementById("emoji-menu").style.display = "none"; handleTypingStatus(); }
function startReply(id, sender, text) { activeReplyId = id; document.getElementById("reply-target-user").innerText = `${sender} yanıtlanıyor`; document.getElementById("reply-target-text").innerText = text; document.getElementById("reply-preview-bar").style.display = "flex"; document.getElementById("message-input").focus(); }
function cancelReply() { activeReplyId = null; document.getElementById("reply-preview-bar").style.display = "none"; }
function toggleSearchBox() {
    const input = document.getElementById("search-input");
    if (input.style.display === "none") { input.style.display = "inline-block"; input.focus(); }
    else { input.style.display = "none"; input.value = ""; searchQuery = ""; loadMessages(); }
}
function filterMessages() {
    searchQuery = document.getElementById("search-input").value.toLowerCase().trim();
    const filtered = Object.values(globalMessages)
        .filter(msg => searchQuery === "" || (msg.text && msg.text.toLowerCase().includes(searchQuery)))
        .sort((a, b) => (a.orderTimestamp || 0) - (b.orderTimestamp || 0));
    renderMessages(filtered);
}