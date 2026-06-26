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
let selectedAvatarIcon = "fa-user"; // Varsayılan ikon sınıfı
let activeReplyId = null; // Yanıtlanan mesajın ID'si

document.addEventListener("DOMContentLoaded", () => {
    checkUserIdentity();
    loadMessages();
    setupAvatarSelection();

    // Enter tuşuna basınca gönderme tetikleyicisi
    document.getElementById("message-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });

    // Açık menüleri ekrana tıklayınca kapatma mekanizması
    document.addEventListener("click", (e) => {
        if (!e.target.closest('.emoji-dropdown-container')) {
            document.getElementById("emoji-menu").style.display = "none";
        }
        if (!e.target.closest('.msg-options-container')) {
            document.querySelectorAll(".action-menu").forEach(el => el.remove());
        }
    });
});

// Profil Seçim Penceresi Yönetimi
function checkUserIdentity() {
    const savedUser = localStorage.getItem("chat_user_name_v2");
    const savedAvatar = localStorage.getItem("chat_user_avatar_v2");

    if (savedUser && savedAvatar) {
        currentUser = savedUser;
        selectedAvatarIcon = savedAvatar;
        
        document.getElementById("user-badge").innerText = currentUser;
        document.getElementById("user-avatar-icon").className = `fa-solid ${selectedAvatarIcon}`;
    } else {
        // Bilgi yoksa pop-up modal ekranını açıyoruz
        document.getElementById("auth-modal").style.display = "flex";
    }
}

function setupAvatarSelection() {
    const options = document.querySelectorAll(".avatar-option");
    options.forEach(opt => {
        opt.addEventListener("click", () => {
            options.forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
            selectedAvatarIcon = opt.getAttribute("data-icon");
        });
    });
}

function saveProfile() {
    const nameInput = document.getElementById("username-input").value.trim();
    if (nameInput === "") {
        alert("Lütfen geçerli bir isim giriniz!");
        return;
    }

    currentUser = nameInput;
    localStorage.setItem("chat_user_name_v2", currentUser);
    localStorage.setItem("chat_user_avatar_v2", selectedAvatarIcon);

    document.getElementById("user-badge").innerText = currentUser;
    document.getElementById("user-avatar-icon").className = `fa-solid ${selectedAvatarIcon}`;
    
    // Modal ekranı kapatıyoruz
    document.getElementById("auth-modal").style.display = "none";
}

// Emoji İşlemleri
function toggleEmojiMenu() {
    const menu = document.getElementById("emoji-menu");
    menu.style.display = menu.style.display === "none" ? "grid" : "none";
}

function appendEmoji(emoji) {
    const input = document.getElementById("message-input");
    input.value += emoji;
    input.focus();
    document.getElementById("emoji-menu").style.display = "none";
}

// Mesaj Yanıtlama Tetikleyicileri
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

// Mesaj Gönderme
function sendMessage() {
    const inputField = document.getElementById("message-input");
    const messageText = inputField.value.trim();

    if (messageText === "") return;

    const id = Date.now().toString();
    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    const newMessage = {
        id: id,
        sender: currentUser,
        avatar: selectedAvatarIcon,
        text: messageText,
        time: timeString,
        replyTo: activeReplyId ? activeReplyId : null // Eğer yanıt varsa ID'sini bağla
    };

    database.ref('messages_v2/' + id).set(newMessage);
    
    inputField.value = "";
    cancelReply(); // Gönderdikten sonra yanıt barını temizle
}

// Canlı Mesajları Getirme ve Yönetme
let globalMessages = {};
function loadMessages() {
    database.ref('messages_v2').on('value', (snapshot) => {
        const data = snapshot.val();
        globalMessages = data ? data : {};
        renderMessages(Object.values(globalMessages));
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

        // İkon Sınıfı Kontrolü
        const iconClass = msg.avatar || "fa-user";

        // Yanıtlanan Mesaj Yapısı Var Mı Kontrolü
        let replyHtml = "";
        if (msg.replyTo && globalMessages[msg.replyTo]) {
            const parentMsg = globalMessages[msg.replyTo];
            replyHtml = `
                <div class="msg-replied-inside">
                    <small><b>${parentMsg.sender}</b></small>
                    <p style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${parentMsg.text}</p>
                </div>
            `;
        }

        // Seçenekler (3 Nokta) Buton Yapısı Containerı
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "msg-options-container";
        optionsContainer.style.position = "relative";
        optionsContainer.innerHTML = `
            <button class="msg-options-trigger" onclick="openActionMenu(event, '${msg.id}', '${msg.sender}', ${isMe})">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        `;

        // Ana Balon İçeriği (İstediğin gibi ":" işareti kaldırıldı!)
        const mainBox = document.createElement("div");
        mainBox.className = "msg-main-box";
        
        const senderNameHtml = isMe ? "" : `<strong>${msg.sender}</strong><br>`;

        mainBox.innerHTML = `
            <div class="msg-bubble">
                ${replyHtml}
                ${senderNameHtml}${msg.text}
            </div>
            <div class="msg-meta">${msg.time}</div>
        `;

        // Avatar Ekleme
        const avatarDiv = document.createElement("div");
        avatarDiv.className = "msg-avatar";
        avatarDiv.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

        // Elemanları Birleştirme
        wrapper.appendChild(avatarDiv);
        wrapper.appendChild(mainBox);
        wrapper.appendChild(optionsContainer);

        chatMessagesDiv.appendChild(wrapper);
    });

    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// 3 Nokta Aksiyon Menüsünü Açma
function openActionMenu(event, id, sender, isMe) {
    event.stopPropagation();
    
    // Eski açık menüleri temizle
    document.querySelectorAll(".action-menu").forEach(el => el.remove());

    const triggerBtn = event.currentTarget;
    const menu = document.createElement("div");
    menu.className = "action-menu";

    // Yanıtla Butonu Herkeste Çıkar
    const msgText = globalMessages[id] ? globalMessages[id].text : "";
    let menuHtml = `<button onclick="startReply('${id}', '${sender}', '${msgText.replace(/'/g, "\\'")}')"><i class="fa-solid fa-reply"></i> Yanıtla</button>`;
    
    // Sil Butonu sadece mesaj sahibinde çıkar
    if (isMe) {
        menuHtml += `<button class="delete-btn" onclick="deleteMessage('${id}')"><i class="fa-solid fa-trash"></i> Sil</button>`;
    }

    menu.innerHTML = menuHtml;
    triggerBtn.parentElement.appendChild(menu);
}

// Mesaj Silme Fonksiyonu
function deleteMessage(id) {
    if (confirm("Bu mesajı herkesten silmek istediğinize emin misiniz?")) {
        database.ref('messages_v2/' + id).remove();
    }
}