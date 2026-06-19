// src/utils/firebaseService.js

import { initializeApp } from 'firebase/app';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

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
        const messages = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Возвращаем в коллбек нужные данные
            messages.push({
                id: doc.id,
                encryptedText: data.encryptedText,
                timestamp: data.timestamp
            });
        });
        
        onMessageCallback(messages);
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

export async function publishRoomMetadata(roomId, encryptedMetadata) {
    if (!roomId || !encryptedMetadata) throw new Error("roomId и encryptedMetadata обязательны");
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    
    try {
        const CHUNK_SIZE = 800000;
        const totalChunks = Math.ceil(encryptedMetadata.length / CHUNK_SIZE);

        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(roomRef, {
            chunksCount: totalChunks,
            updatedAt: serverTimestamp()
        }, { merge: true });

        for (let i = 0; i < totalChunks; i++) {
            const chunkStr = encryptedMetadata.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkRef = doc(db, 'rooms', `${roomId}_chunk_${i}`);
            await setDoc(chunkRef, { index: i, data: chunkStr });
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
