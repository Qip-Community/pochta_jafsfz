// ============================================================
// 1. ИМПОРТЫ FIREBASE
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInAnonymously,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
// 2. КОНФИГ FIREBASE
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyCLgx5aCoaNf629emINCMIKnmk66aH8EGw",
    authDomain: "aqua-dreams-2000.firebaseapp.com",
    projectId: "aqua-dreams-2000",
    storageBucket: "aqua-dreams-2000.firebasestorage.app",
    messagingSenderId: "418396479657",
    appId: "1:418396479657:web:5a262718a48033b34389b8"
};

// ============================================================
// 3. ИНИЦИАЛИЗАЦИЯ
// ============================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ============================================================
// 4. СОСТОЯНИЕ
// ============================================================
let state = {
    currentUser: null,
    currentFolder: 'inbox',
    messages: []
};

let unsubscribeMessages = null;

// ============================================================
// 5. DOM-ХЕЛПЕРЫ
// ============================================================
const $ = (id) => document.getElementById(id);

const authScreen = $('authScreen');
const mailScreen = $('mailScreen');
const currentUserSpan = $('currentUser');
const logoutBtn = $('logoutBtn');
const mailList = $('mailList');
const folderTitle = $('folderTitle');

// ============================================================
// 6. АВТОРИЗАЦИЯ
// ============================================================
$('googleLoginBtn').onclick = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        console.error('Google login error:', err);
        alert('Не удалось войти через Google.\n' + err.message);
    }
};

$('anonLoginBtn').onclick = async () => {
    try {
        await signInAnonymously(auth);
    } catch (err) {
        console.error('Anon login error:', err);
        alert('Не удалось войти анонимно.\n' + err.message);
    }
};

logoutBtn.onclick = async () => {
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    await signOut(auth);
    state.messages = [];
    location.reload();
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        state.currentUser = {
            uid: user.uid,
            name: user.displayName || `Гость-${user.uid.slice(0, 6)}`,
            email: user.email || null,
            isAnonymous: user.isAnonymous
        };
        enterApp();
        subscribeToMessages();
    } else {
        state.currentUser = null;
        exitApp();
    }
});

function enterApp() {
    authScreen.classList.add('hidden');
    mailScreen.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    currentUserSpan.textContent = `👤 ${state.currentUser.name}`;
}

function exitApp() {
    authScreen.classList.remove('hidden');
    mailScreen.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    currentUserSpan.textContent = 'Не авторизован';
}

// ============================================================
// 7. ПОДПИСКА НА СООБЩЕНИЯ (REALTIME)
// ============================================================
function subscribeToMessages() {
    if (unsubscribeMessages) unsubscribeMessages();

    const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'desc')
    );

    unsubscribeMessages = onSnapshot(q,
        (snapshot) => {
            state.messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            render();
        },
        (error) => {
            console.error('Firestore error:', error);
            mailList.innerHTML = `<div class="empty">Ошибка загрузки: ${error.message}</div>`;
        }
    );
}

// ============================================================
// 8. ОТПРАВКА ПИСЬМА
// ============================================================
$('composeBtn').onclick = () => $('composeModal').classList.remove('hidden');
$('cancelBtn').onclick = () => $('composeModal').classList.add('hidden');

$('sendBtn').onclick = async () => {
    const to = $('mailTo').value.trim() || 'all';
    const subject = $('mailSubject').value.trim();
    const body = $('mailBody').value.trim();

    if (!subject || !body) {
        alert('Заполните тему и текст');
        return;
    }

    const sendBtn = $('sendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Отправка...';

    try {
        await addDoc(collection(db, 'messages'), {
            from: state.currentUser.name,
            fromUid: state.currentUser.uid,
            to: to,
            subject: subject,
            body: body,
            createdAt: Date.now()
        });

        $('mailTo').value = '';
        $('mailSubject').value = '';
        $('mailBody').value = '';
        $('composeModal').classList.add('hidden');
    } catch (err) {
        console.error('Send error:', err);
        alert('Не удалось отправить письмо: ' + err.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить';
    }
};

// ============================================================
// 9. НАВИГАЦИЯ ПО ПАПКАМ
// ============================================================
document.querySelectorAll('.sidebar nav a').forEach(link => {
    link.onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        state.currentFolder = link.dataset.folder;
        render();
    };
});

// ============================================================
// 10. ПРОСМОТР ПИСЬМА
// ============================================================
$('closeViewBtn').onclick = () => $('viewModal').classList.add('hidden');

function openMessage(m) {
    $('viewSubject').textContent = m.subject;
    $('viewMeta').textContent = `От: ${m.from} → Кому: ${m.to} • ${formatDate(m.createdAt)}`;
    $('viewBody').textContent = m.body;
    $('viewModal').classList.remove('hidden');
}

// ============================================================
// 11. РЕНДЕР
// ============================================================
function render() {
    if (!state.currentUser) return;

    const user = state.currentUser;
    const folder = state.currentFolder;
    const all = state.messages;

    let messages = [];

    if (folder === 'inbox') {
        folderTitle.textContent = 'Входящие';
        messages = all.filter(m =>
            (m.to === 'all' || m.to === user.name) && m.fromUid !== user.uid
        );
    } else if (folder === 'sent') {
        folderTitle.textContent = 'Отправленные';
        messages = all.filter(m => m.fromUid === user.uid);
    } else {
        folderTitle.textContent = 'Все сообщения';
        messages = all;
    }

    mailList.innerHTML = '';

    if (messages.length === 0) {
        mailList.innerHTML = '<div class="empty">Писем нет</div>';
        return;
    }

    messages.forEach(m => {
        const li = document.createElement('li');
        li.className = 'mail-item';

        const subj = document.createElement('div');
        subj.className = 'subject';
        subj.textContent = m.subject;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `От: ${m.from} → Кому: ${m.to} • ${formatDate(m.createdAt)}`;

        const preview = document.createElement('div');
        preview.className = 'preview';
        preview.textContent = m.body.length > 100
            ? m.body.slice(0, 100) + '…'
            : m.body;

        li.appendChild(subj);
        li.appendChild(meta);
        li.appendChild(preview);
        li.onclick = () => openMessage(m);

        mailList.appendChild(li);
    });
}

// ============================================================
// 12. УТИЛИТЫ
// ============================================================
function formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        $('composeModal').classList.add('hidden');
        $('viewModal').classList.add('hidden');
    }
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    };
});