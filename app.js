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
    orderBy,
    doc,
    setDoc,
    getDocs
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
    messages: [],
    users: [],
    readMessages: JSON.parse(localStorage.getItem('readMessages') || '[]'),
    searchQuery: ''
};

let unsubscribeMessages = null;

// ============================================================
// 5. DOM-ХЕЛПЕРЫ
// ============================================================
const $ = (id) => document.getElementById(id);

const authScreen = $('authScreen');
const mailScreen = $('mailScreen');
const currentUserSpan = $('currentUser');
const userEmailSpan = $('userEmail');
const userAvatar = $('userAvatar');
const logoutBtn = $('logoutBtn');
const mailList = $('mailList');
const folderTitle = $('folderTitle');
const inboxBadge = $('inboxBadge');
const searchInput = $('searchInput');
const usersList = $('usersList');

// ============================================================
// 6. АВТОРИЗАЦИЯ
// ============================================================
$('googleLoginBtn').onclick = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        console.error('Google login error:', err);
        if (err.code === 'auth/unauthorized-domain') {
            alert('⚠️ Домен не авторизован.\n\nДобавь в Firebase Console:\nAuthentication → Settings → Authorized domains → Add domain → ' + location.hostname);
        } else {
            alert('Не удалось войти через Google.\n' + err.message);
        }
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

onAuthStateChanged(auth, async (user) => {
    if (user) {
        state.currentUser = {
            uid: user.uid,
            name: user.displayName || `Гость-${user.uid.slice(0, 6)}`,
            email: user.email || null,
            photo: user.photoURL || null,
            isAnonymous: user.isAnonymous
        };
        await registerUser();
        enterApp();
        subscribeToMessages();
    } else {
        state.currentUser = null;
        exitApp();
    }
});

// Сохраняем профиль в Firestore, чтобы другие видели имена
async function registerUser() {
    if (!state.currentUser) return;
    try {
        await setDoc(doc(db, 'users', state.currentUser.uid), {
            name: state.currentUser.name,
            email: state.currentUser.email || null,
            photo: state.currentUser.photo || null,
            lastSeen: Date.now()
        }, { merge: true });
    } catch (err) {
        console.error('Register user error:', err);
    }
}

function enterApp() {
    authScreen.classList.add('hidden');
    mailScreen.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    currentUserSpan.textContent = state.currentUser.name;
    userEmailSpan.textContent = state.currentUser.email || 'анонимный';

    if (state.currentUser.photo) {
        userAvatar.src = state.currentUser.photo;
    } else {
        userAvatar.replaceWith(createAvatarEl(state.currentUser.name, userAvatar));
    }

    subscribeToUsers();
}

function exitApp() {
    authScreen.classList.remove('hidden');
    mailScreen.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    currentUserSpan.textContent = 'Не авторизован';
    userEmailSpan.textContent = '';
}

// ============================================================
// 7. ПОДПИСКА НА СООБЩЕНИЯ
// ============================================================
function subscribeToMessages() {
    if (unsubscribeMessages) unsubscribeMessages();

    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));

    unsubscribeMessages = onSnapshot(q,
        (snapshot) => {
            state.messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            render();
            updateBadge();
        },
        (error) => {
            console.error('Firestore error:', error);
            mailList.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Ошибка: ${error.message}</div></div>`;
        }
    );
}

// ============================================================
// 8. ПОДПИСКА НА ПОЛЬЗОВАТЕЛЕЙ (для автокомплита)
// ============================================================
function subscribeToUsers() {
    onSnapshot(collection(db, 'users'), (snapshot) => {
        state.users = snapshot.docs.map(d => d.data());
        usersList.innerHTML = '';
        // "all" + все имена
        const names = new Set(['all']);
        state.users.forEach(u => u.name && names.add(u.name));
        names.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            usersList.appendChild(opt);
        });
    });
}

// ============================================================
// 9. ОТПРАВКА
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
            fromPhoto: state.currentUser.photo || null,
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
        alert('Не удалось отправить: ' + err.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить ➤';
    }
};

// ============================================================
// 10. НАВИГАЦИЯ
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

searchInput.oninput = (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    render();
};

// ============================================================
// 11. ПРОСМОТР И ОТВЕТ
// ============================================================
$('closeViewBtn').onclick = () => $('viewModal').classList.add('hidden');
$('replyBtn').onclick = () => {
    const to = $('viewFrom').textContent.replace('от ', '');
    const subject = $('viewSubject').textContent;
    const replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
    $('mailTo').value = to;
    $('mailSubject').value = replySubject;
    $('mailBody').value = '\n\n--- Исходное сообщение ---\n' + $('viewBody').textContent;
    $('viewModal').classList.add('hidden');
    $('composeModal').classList.remove('hidden');
    $('mailBody').focus();
};

function openMessage(m) {
    // Помечаем как прочитанное
    if (!state.readMessages.includes(m.id)) {
        state.readMessages.push(m.id);
        localStorage.setItem('readMessages', JSON.stringify(state.readMessages));
        updateBadge();
    }

    $('viewSubject').textContent = m.subject;
    $('viewFrom').textContent = 'от ' + m.from;
    $('viewMeta').textContent = `Кому: ${m.to} • ${formatDate(m.createdAt)}`;
    $('viewBody').textContent = m.body;

    const avatarEl = $('viewAvatar');
    if (m.fromPhoto) {
        avatarEl.src = m.fromPhoto;
        avatarEl.style.display = '';
    } else {
        avatarEl.src = '';
        avatarEl.style.display = 'none';
        // Вставляем буквенный аватар
        const letterAvatar = createAvatarEl(m.from);
        letterAvatar.id = 'viewAvatar';
        avatarEl.replaceWith(letterAvatar);
    }

    $('viewModal').classList.remove('hidden');
}

// ============================================================
// 12. РЕНДЕР
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

    // Поиск
    if (state.searchQuery) {
        messages = messages.filter(m =>
            m.subject.toLowerCase().includes(state.searchQuery) ||
            m.body.toLowerCase().includes(state.searchQuery) ||
            m.from.toLowerCase().includes(state.searchQuery)
        );
    }

    mailList.innerHTML = '';

    if (messages.length === 0) {
        mailList.innerHTML = `
            <div class="empty">
                <div class="empty-icon">📭</div>
                <div class="empty-text">${state.searchQuery ? 'Ничего не найдено' : 'Писем нет'}</div>
            </div>`;
        return;
    }

    messages.forEach(m => {
        const li = document.createElement('li');
        li.className = 'mail-item';
        if (!state.readMessages.includes(m.id) && m.fromUid !== user.uid) {
            li.classList.add('unread');
        }

        // Аватар
        const avatar = createAvatarEl(m.from);

        // Контент
        const content = document.createElement('div');
        content.className = 'mail-content';

        const top = document.createElement('div');
        top.className = 'mail-top';
        const from = document.createElement('div');
        from.className = 'mail-from';
        from.textContent = m.from;
        const date = document.createElement('div');
        date.className = 'mail-date';
        date.textContent = formatDate(m.createdAt);
        top.appendChild(from);
        top.appendChild(date);

        const subject = document.createElement('div');
        subject.className = 'mail-subject';
        subject.textContent = m.subject;

        const preview = document.createElement('div');
        preview.className = 'mail-preview';
        preview.textContent = m.body;

        content.appendChild(top);
        content.appendChild(subject);
        content.appendChild(preview);

        li.appendChild(avatar);
        li.appendChild(content);
        li.onclick = () => openMessage(m);

        mailList.appendChild(li);
    });
}

function updateBadge() {
    if (!state.currentUser) return;
    const user = state.currentUser;
    const unread = state.messages.filter(m =>
        (m.to === 'all' || m.to === user.name) &&
        m.fromUid !== user.uid &&
        !state.readMessages.includes(m.id)
    ).length;

    if (unread > 0) {
        inboxBadge.textContent = unread > 99 ? '99+' : unread;
        inboxBadge.classList.remove('hidden');
        document.title = `(${unread}) Общая почта`;
    } else {
        inboxBadge.classList.add('hidden');
        document.title = 'Общая почта';
    }
}

// ============================================================
// 13. УТИЛИТЫ
// ============================================================
function createAvatarEl(name, replaceEl) {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    const div = document.createElement('div');
    div.className = 'avatar mail-avatar';
    div.textContent = initial;

    // Цвет по имени
    const colors = [
        ['#4a90e2', '#6ba8ef'],
        ['#e94e77', '#f4789b'],
        ['#41b883', '#5fd6a1'],
        ['#f39c12', '#f5b041'],
        ['#9b59b6', '#b07cc6'],
        ['#16a085', '#1abc9c'],
        ['#e74c3c', '#ec7063']
    ];
    const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const [c1, c2] = colors[hash % colors.length];
    div.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;

    if (replaceEl && replaceEl.parentNode) {
        replaceEl.parentNode.replaceChild(div, replaceEl);
    }
    return div;
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

// ============================================================
// 14. ЗАКРЫТИЕ МОДАЛОК
// ============================================================
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

document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => $(btn.dataset.close).classList.add('hidden');
});