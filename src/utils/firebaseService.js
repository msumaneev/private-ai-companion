// src/utils/firebaseService.js

import { initializeApp } from 'firebase/app';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp,
    doc,
    updateDoc,
    deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim()
};

if (!firebaseConfig.apiKey) {
    console.warn("⚠️ Firebase config is missing! Set VITE_FIREBASE_* env variables. See docs/FIREBASE_SETUP.md");
}

// Инициализация приложения и базы данных. 
// Пока нет ключей, эти строки могут бросить ошибку при реальном импорте и запуске,
// поэтому закомментируйте их или вставьте демо-ключи, если нужно протестировать.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Подписывается на обновления в комнате и вызывает коллбек при появлении новых сообщений
 * @param {string} roomId Идентификатор комнаты
 * @param {function} onMessageCallback Функция-коллбек для новых сообщений
 * @returns {function} Функция отписки (unsubscribe) от слушателя
 */
export function subscribeToRoom(roomId, onMessageCallback) {
    if (!roomId) throw new Error("roomId обязателен");
    
    // Ссылка на коллекцию сообщений внутри документа комнаты
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    
    // Запрашиваем сообщения, отсортированные по времени создания (от старых к новым)
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    // Подписываемся на обновления
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const changes = [];
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const data = change.doc.data();
                changes.push({
                    type: change.type,
                    data: {
                        id: change.doc.id,
                        encryptedText: data.encryptedText,
                        timestamp: data.timestamp
                    }
                });
            } else if (change.type === 'removed') {
                changes.push({
                    type: change.type,
                    data: {
                        id: change.doc.id
                    }
                });
            }
        });
        
        if (changes.length > 0) {
            onMessageCallback(changes);
        }
    }, (error) => {
        console.error("Ошибка при подписке на комнату:", error);
    });

    return unsubscribe;
}

/**
 * Отправляет новое зашифрованное сообщение в Firebase
 * @param {string} roomId Идентификатор комнаты
 * @param {string} encryptedText Зашифрованная строка с сообщением
 * @returns {Promise<string>} Возвращает ID созданного документа
 */
export async function sendMessage(roomId, encryptedText) {
    if (!roomId || !encryptedText) throw new Error("roomId и encryptedText обязательны");

    try {
        const messagesRef = collection(db, 'rooms', roomId, 'messages');
        const docRef = await addDoc(messagesRef, {
            encryptedText,
            timestamp: serverTimestamp() // Метка времени ставится на сервере Firebase
        });
        return docRef.id;
    } catch (error) {
        console.error("Ошибка при отправке сообщения:", error);
        throw error;
    }
}

/**
 * Обновляет зашифрованное сообщение в Firebase
 * @param {string} roomId Идентификатор комнаты
 * @param {string} messageId Идентификатор сообщения
 * @param {string} encryptedText Новая зашифрованная строка
 */
export async function updateMessage(roomId, messageId, encryptedText) {
    if (!roomId || !messageId || !encryptedText) throw new Error("roomId, messageId и encryptedText обязательны");
    
    try {
        const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);
        await updateDoc(messageRef, {
            encryptedText
        });
    } catch (error) {
        console.error("Ошибка при обновлении сообщения:", error);
        throw error;
    }
}

/**
 * Удаляет сообщение из Firebase
 * @param {string} roomId Идентификатор комнаты
 * @param {string} messageId Идентификатор сообщения
 */
export async function deleteMessage(roomId, messageId) {
    if (!roomId || !messageId) throw new Error("roomId и messageId обязательны");
    
    try {
        const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);
        await deleteDoc(messageRef);
    } catch (error) {
        console.error("Ошибка при удалении сообщения:", error);
        throw error;
    }
}

export async function publishRoomMetadata(roomId, encryptedMetadata) {
    if (!roomId || !encryptedMetadata) throw new Error("roomId и encryptedMetadata обязательны");
    const { doc, setDoc, serverTimestamp, Timestamp } = await import('firebase/firestore');
    
    try {
        const CHUNK_SIZE = 800000;
        const totalChunks = Math.ceil(encryptedMetadata.length / CHUNK_SIZE);
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + 72 * 60 * 60 * 1000)); // 72 часа

        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(roomRef, {
            chunksCount: totalChunks,
            updatedAt: serverTimestamp(),
            expiresAt
        }, { merge: true });

        for (let i = 0; i < totalChunks; i++) {
            const chunkStr = encryptedMetadata.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkRef = doc(db, 'rooms', `${roomId}_chunk_${i}`);
            await setDoc(chunkRef, { index: i, data: chunkStr, expiresAt });
        }
    } catch (error) {
        console.error("Ошибка при сохранении метаданных:", error);
        throw error;
    }
}

/**
 * Получает метаданные комнаты по ее ID
 */
export async function fetchRoomMetadata(roomId) {
    if (!roomId) throw new Error("roomId обязателен");
    const { doc, getDoc } = await import('firebase/firestore');
    
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const docSnap = await getDoc(roomRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Проверяем срок действия ссылки
            if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
                console.warn("Ссылка просрочена:", roomId);
                return { expired: true };
            }
            
            if (data.metadata) {
                return data.metadata; // Обратная совместимость
            }
            if (data.chunksCount) {
                let fullMetadata = '';
                for (let i = 0; i < data.chunksCount; i++) {
                    const chunkRef = doc(db, 'rooms', `${roomId}_chunk_${i}`);
                    const chunkSnap = await getDoc(chunkRef);
                    if (chunkSnap.exists()) {
                        fullMetadata += chunkSnap.data().data;
                    }
                }
                return fullMetadata;
            }
        }
        return null;
    } catch (error) {
        console.error("Ошибка при получении метаданных:", error);
        throw error;
    }
}
