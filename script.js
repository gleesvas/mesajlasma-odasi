// Firebase Ayarları (KYK projesindeki config bilgilerini buraya yapıştır)
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

let currentUser = "";

document.addEventListener("DOMContentLoaded", () => {
    checkUserIdentity();
    loadMessages();

    // Enter tuşuna basınca mesajı göndersin
    document.getElementById("message-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });
});

// İsim Sorma Modülü (KYK paneliyle aynı mantık)
function checkUserIdentity() {
    let savedUser = localStorage.getItem("chat_user_name");
    
    while (!savedUser || savedUser.trim() === "") {
        savedUser = prompt("Sohbete katılmak için lütfen Adınızı giriniz:");
    }
    
    currentUser = savedUser.trim();
    localStorage.setItem("chat_user_name", currentUser);
    
    // Sağ üstteki rozete ismi yazalım
    document.getElementById("user-badge").innerText = currentUser;
}

// Mesaj Gönderme Fonksiyonu
function sendMessage() {
    const inputField = document.getElementById("message-input");
    const messageText = inputField.value.trim();

    if (messageText === "") return;

    const id = Date.now().toString();
    
    // Şu anki saati GG:DD formatında alalım
    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    const newMessage = {
        id: id,
        sender: currentUser,
        text: messageText,
        time: timeString
    };

    // Firebase'de "messages" düğümünün altına kaydet
    database.ref('messages/' + id).set(newMessage);
    
    inputField.value = ""; // Giriş alanını temizle
}

// Mesajları Canlı Olarak Yükleme
function loadMessages() {
    database.ref('messages').on('value', (snapshot) => {
        const data = snapshot.val();
        const messageList = data ? Object.values(data) : [];
        renderMessages(messageList);
    });
}

// Mesajları Ekrana Basma
function renderMessages(messages) {
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "";

    messages.forEach(msg => {
        const wrapper = document.createElement("div");
        
        // Mesaj bana mı ait başkasına mı kontrolü
        if (msg.sender === currentUser) {
            wrapper.className = "msg-wrapper me";
            wrapper.innerHTML = `
                <div class="msg-bubble">${msg.text}</div>
                <div class="msg-meta">${msg.time}</div>
            `;
        } else {
            wrapper.className = "msg-wrapper other";
            wrapper.innerHTML = `
                <div class="msg-bubble"><strong>${msg.sender}:</strong> <br>${msg.text}</div>
                <div class="msg-meta">${msg.time}</div>
            `;
        }

        chatMessagesDiv.appendChild(wrapper);
    });

    // Yeni mesaj gelince sohbet penceresini otomatik en aşağı kaydır
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}