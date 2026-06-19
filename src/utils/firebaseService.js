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
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCc-VApuGFu4QcPdYEnbzmOhDI5zJPJQTk",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "private-ai-companion-59d6f.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "private-ai-companion-59d6f",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "private-ai-companion-59d6f.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "828842217718",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:828842217718:web:8849a83a57d42f25f31cd7"
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
    console.log("Dynamically importing firestore modules...");
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    
    try {
        const CHUNK_SIZE = 800000;
        const totalChunks = Math.ceil(encryptedMetadata.length / CHUNK_SIZE);
        console.log(`Calculated totalChunks: ${totalChunks}`);

        console.log("Getting roomRef...");
        const roomRef = doc(db, 'rooms', roomId);
        console.log("Calling setDoc for roomRef...");
        await setDoc(roomRef, {
            chunksCount: totalChunks,
            updatedAt: serverTimestamp()
        }, { merge: true });
        console.log("setDoc for roomRef completed.");

        for (let i = 0; i < totalChunks; i++) {
            console.log(`Writing chunk ${i}...`);
            const chunkStr = encryptedMetadata.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkRef = doc(db, 'rooms', `${roomId}_chunk_${i}`);
            await setDoc(chunkRef, { index: i, data: chunkStr });
            console.log(`Chunk ${i} written.`);
        }
        console.log("publishRoomMetadata fully completed.");
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
