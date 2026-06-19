// src/utils/cryptoUtils.js

/**
 * Генерирует новый ключ для AES-GCM
 */
export async function generateKey() {
    return await window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true, // Ключ можно экспортировать
        ["encrypt", "decrypt"]
    );
}

/**
 * Экспортирует ключ в формате base64 (raw) для удобного сохранения/обмена (если потребуется)
 */
export async function exportKey(key) {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return bufferToBase64(exported);
}

/**
 * Импортирует ключ из base64 строки
 */
export async function importKey(base64Key) {
    const buffer = base64ToBuffer(base64Key);
    return await window.crypto.subtle.importKey(
        "raw",
        buffer,
        "AES-GCM",
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Шифрует объект данных и возвращает base64 строку формата "iv:encryptedData"
 * @param {Object} dataObj Объект данных (будет сериализован в JSON)
 * @param {CryptoKey} key Ключ шифрования
 */
export async function encryptMessage(dataObj, key) {
    // 1. Сериализуем данные в JSON
    const jsonStr = JSON.stringify(dataObj);
    const encodedData = new TextEncoder().encode(jsonStr);

    // 2. Генерируем вектор инициализации (IV), необходим для AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // 3. Шифруем данные
    const encryptedContent = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encodedData
    );

    // 4. Кодируем в base64 и склеиваем
    const ivBase64 = bufferToBase64(iv.buffer);
    const encryptedBase64 = bufferToBase64(encryptedContent);

    // Возвращаем строку, содержащую и вектор инициализации, и зашифрованные данные
    return `${ivBase64}:${encryptedBase64}`;
}

/**
 * Расшифровывает строку формата "iv:encryptedData" и возвращает исходный объект
 * @param {string} encryptedStr Зашифрованная строка
 * @param {CryptoKey} key Ключ шифрования
 */
export async function decryptMessage(encryptedStr, key) {
    // 1. Разделяем IV и зашифрованные данные
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
        throw new Error('Некорректный формат зашифрованной строки. Ожидается "iv:data"');
    }

    const iv = base64ToBuffer(parts[0]);
    const encryptedData = base64ToBuffer(parts[1]);

    // 2. Расшифровываем
    const decryptedContent = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(iv)
        },
        key,
        encryptedData
    );

    // 3. Декодируем строку и парсим JSON
    const decodedStr = new TextDecoder().decode(decryptedContent);
    return JSON.parse(decodedStr);
}

// === Вспомогательные функции ===

function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
