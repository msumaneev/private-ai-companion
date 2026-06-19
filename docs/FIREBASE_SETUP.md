# 🔥 Настройка Firebase для Private AI Companion

Это пошаговая инструкция по созданию и настройке собственной базы данных Firebase для вашего форка проекта. Firebase используется для:

- **Мультиплеерных чатов** — синхронизация сообщений между участниками в реальном времени
- **Приглашений по ссылке** — передача зашифрованных карточек персонажей и истории чата
- **Синхронизации устройств** — перенос чата с компьютера на телефон

> [!NOTE]
> Все данные шифруются на стороне клиента (AES-256-GCM) **до** отправки в Firebase. Сервер никогда не видит расшифрованный текст ваших сообщений.

---

## Содержание

1. [Создание проекта Firebase](#1-создание-проекта-firebase)
2. [Создание базы данных Firestore](#2-создание-базы-данных-firestore)
3. [Настройка правил безопасности](#3-настройка-правил-безопасности)
4. [Настройка TTL (автоудаление)](#4-настройка-ttl-автоудаление)
5. [Получение ключей конфигурации](#5-получение-ключей-конфигурации)
6. [Подключение к проекту](#6-подключение-к-проекту)
7. [Деплой на GitHub Pages](#7-деплой-на-github-pages)
8. [Проверка работоспособности](#8-проверка-работоспособности)
9. [FAQ и устранение неполадок](#9-faq-и-устранение-неполадок)

---

## 1. Создание проекта Firebase

1. Откройте [Firebase Console](https://console.firebase.google.com/).
2. Нажмите **«Создать проект»** (Create a project).
3. Введите имя проекта (например, `my-ai-companion`).
4. Google Analytics — **отключите** (не нужен для этого проекта). Нажмите **«Создать проект»**.
5. Дождитесь создания проекта и нажмите **«Продолжить»**.

---

## 2. Создание базы данных Firestore

1. В левом меню Firebase Console выберите **Build → Firestore Database**.
2. Нажмите **«Create database»** (Создать базу данных).
3. Выберите регион сервера:
   - Для России/СНГ рекомендуется: `europe-west1` (Бельгия) или `europe-central2` (Варшава).
   - Для США: `us-central1` (Айова).
   
   > [!WARNING]
   > Регион нельзя изменить после создания! Выбирайте ближайший к вашим пользователям.

4. Выберите **«Start in test mode»** (Тестовый режим) — мы настроим правила на следующем шаге.
5. Нажмите **«Create»**.

---

## 3. Настройка правил безопасности

Тестовый режим даёт полный доступ всем, что небезопасно. Настроим правильные правила:

1. В Firestore Database перейдите на вкладку **«Rules»** (Правила).
2. Замените содержимое на:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Комнаты: разрешаем чтение и запись всем
    // (данные зашифрованы на клиенте, сервер видит только шифротекст)
    match /rooms/{roomId} {
      allow read, write: if true;
      
      // Подколлекция сообщений внутри комнаты
      match /messages/{messageId} {
        allow read, write: if true;
      }
    }
  }
}
```

3. Нажмите **«Publish»** (Опубликовать).

> [!IMPORTANT]
> Эти правила разрешают чтение/запись в коллекцию `rooms` всем пользователям. Это безопасно, потому что:
> - Все данные зашифрованы AES-256-GCM на клиенте
> - Ключ шифрования передаётся только через ссылку (не хранится на сервере)
> - Без ключа данные — бессмысленный набор символов

---

## 4. Настройка TTL (автоудаление)

Ссылки-приглашения автоматически истекают через 72 часа на клиенте, но документы остаются в базе. Чтобы Firebase автоматически удалял просроченные документы (и не тратил ваши деньги на хранение):

1. В Firestore Database перейдите на вкладку **«(≡) → Time-to-live (TTL)»**.
   - Либо откройте: **Firestore → Indexes → TTL policies**.
2. Нажмите **«Create policy»**.
3. Заполните:
   - **Collection group**: `rooms`
   - **Timestamp field**: `expiresAt`
4. Нажмите **«Create»**.

> [!NOTE]
> TTL-политика удаляет документы в фоновом режиме. Удаление может занять до 24 часов после истечения срока. Это нормальное поведение Firebase.

---

## 5. Получение ключей конфигурации

1. В Firebase Console нажмите на иконку **⚙️** (шестерёнка) рядом с «Project Overview» → **Project settings**.
2. Прокрутите вниз до раздела **«Your apps»**.
3. Нажмите на иконку **«</>»** (Web) чтобы добавить веб-приложение.
4. Введите название (например, `AI Companion Web`) и нажмите **«Register app»**.
5. Firebase покажет конфигурацию. Вам нужны эти значения:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",           // ← Копируем
  authDomain: "xxx.firebaseapp.com",  // ← Копируем
  projectId: "xxx",             // ← Копируем
  storageBucket: "xxx.appspot.com",   // ← Копируем
  messagingSenderId: "123456",  // ← Копируем
  appId: "1:123456:web:abc"     // ← Копируем
};
```

6. Скопируйте все 6 значений — они понадобятся на следующем шаге.

> [!TIP]
> Эти ключи можно найти позже в любое время: **Project settings → Your apps → SDK setup and configuration**.

---

## 6. Подключение к проекту

### Вариант A: Для локальной разработки (рекомендуется)

Создайте файл `.env.local` в корне проекта:

```bash
VITE_FIREBASE_API_KEY=ваш_apiKey
VITE_FIREBASE_AUTH_DOMAIN=ваш_authDomain
VITE_FIREBASE_PROJECT_ID=ваш_projectId
VITE_FIREBASE_STORAGE_BUCKET=ваш_storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID=ваш_messagingSenderId
VITE_FIREBASE_APP_ID=ваш_appId
```

> [!NOTE]
> Файл `.env.local` уже добавлен в `.gitignore` и **не попадёт в Git**. Это безопасно для локальной разработки.

### Вариант B: Для деплоя на GitHub Pages (обязательно)

Поскольку `.env.local` не попадает в Git, GitHub Actions при сборке не будет видеть ваши ключи. Есть два способа решить это:

#### Способ 1: Хардкод в коде (простой)

Откройте файл `src/utils/firebaseService.js` и замените fallback-значения в конфигурации на свои:

```javascript
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "ВСТАВЬТЕ_СВОЙ_API_KEY",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ВСТАВЬТЕ_СВОЙ_AUTH_DOMAIN",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ВСТАВЬТЕ_СВОЙ_PROJECT_ID",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ВСТАВЬТЕ_СВОЙ_STORAGE_BUCKET",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "ВСТАВЬТЕ_СВОЙ_MESSAGING_SENDER_ID",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "ВСТАВЬТЕ_СВОЙ_APP_ID"
};
```

> [!TIP]
> Firebase API-ключи для клиентских приложений **не являются секретными**. Они лишь идентифицируют ваш проект. Безопасность обеспечивается правилами Firestore (шаг 3) и клиентским шифрованием.

#### Способ 2: GitHub Secrets (продвинутый)

1. В вашем GitHub-репозитории: **Settings → Secrets and variables → Actions**.
2. Добавьте каждый ключ как Repository Secret:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

3. Обновите `.github/workflows/deploy.yml`, добавив секреты в шаг сборки:

```yaml
      - name: Build
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
```

---

## 7. Деплой на GitHub Pages

### Первоначальная настройка

1. Форкните репозиторий на GitHub.
2. В форке: **Settings → Pages → Source** → выберите **GitHub Actions**.
3. Откройте `vite.config.js` и убедитесь, что `base` соответствует имени вашего репозитория:

```javascript
export default defineConfig({
  base: '/имя-вашего-репозитория/',
  // ...
})
```

4. Закоммитьте и запушьте изменения — GitHub Actions автоматически соберёт и задеплоит проект.

### Последующие обновления

Просто делайте `git push` в ветку `main` — деплой произойдёт автоматически за 1-2 минуты.

> [!CAUTION]
> Приложение использует PWA (Service Worker) с агрессивным кэшированием. Если после деплоя вы не видите изменений, нажмите `Ctrl+Shift+R` (жёсткая перезагрузка) или откройте в режиме Инкогнито.

---

## 8. Проверка работоспособности

После деплоя убедитесь, что всё работает:

1. **Откройте приложение** в браузере.
2. **Создайте персонажа** и начните чат.
3. **Нажмите ⋮ → «Пригласить друга»** — должно появиться окно со ссылкой.
4. **Откройте ссылку** в другом браузере или окне Инкогнито — должно появиться окно Лобби.
5. **Нажмите ⋮ → «Синхронизировать устройство»** — откройте ссылку на телефоне, чат должен перенестись целиком.

Если на шаге 3 ссылка не появляется — откройте консоль разработчика (F12) и проверьте ошибки. Частые причины:
- Неправильные ключи Firebase → ошибка `FirebaseError: Missing or insufficient permissions`
- Правила безопасности не настроены → ошибка `PERMISSION_DENIED`

---

## 9. FAQ и устранение неполадок

### Сколько стоит Firebase?

Бесплатный план (**Spark**) включает:
- **1 ГБ** хранилища Firestore
- **50 000** чтений / день
- **20 000** записей / день
- **50 000** удалений / день

Для домашнего использования с несколькими чатами этого более чем достаточно.

### Что если я превышу лимиты?

Firebase просто заблокирует запросы до конца дня. Данные не потеряются. Для увеличения лимитов перейдите на план **Blaze** (pay-as-you-go).

### Безопасно ли хранить API-ключи в коде?

Да, для Firebase **клиентских** ключей это нормальная практика. Ключ лишь идентифицирует ваш проект Firebase. Реальная безопасность обеспечивается:
- **Правилами Firestore** (кто может читать/писать)
- **Клиентским шифрованием** (AES-256-GCM) — сервер видит только шифротекст

### Ошибка «String contains an invalid character»

Если вы видите эту ошибку при открытии ссылки-приглашения, скорее всего символ `+` в ключе шифрования был превращён в пробел при передаче через URL. Убедитесь, что в коде ключ оборачивается в `encodeURIComponent()`.

### Ошибка 404 при открытии ссылки на телефоне

Убедитесь, что ссылка содержит полный путь к приложению:
- ❌ `https://username.github.io/#room=...`
- ✅ `https://username.github.io/repo-name/#room=...`

### Как удалить старые данные вручную?

В Firebase Console → Firestore Database → коллекция `rooms` → выберите документ → **Delete document**.

---

## Структура данных в Firestore

```
rooms/
├── {roomId}/                    # Основной документ комнаты
│   ├── chunksCount: number      # Количество чанков метаданных
│   ├── updatedAt: timestamp     # Дата последнего обновления
│   ├── expiresAt: timestamp     # Дата истечения (TTL, +72 часа)
│   └── messages/                # Подколлекция сообщений (реалтайм чат)
│       └── {messageId}/
│           ├── data: string     # Зашифрованное сообщение (AES-256-GCM)
│           └── timestamp: timestamp
├── {roomId}_chunk_0/            # Чанк метаданных #0
│   ├── index: 0
│   ├── data: string             # Часть зашифрованных метаданных
│   └── expiresAt: timestamp
├── {roomId}_chunk_1/            # Чанк метаданных #1 (если нужен)
│   └── ...
└── ...
```

> [!NOTE]
> Чанки хранятся как отдельные документы верхнего уровня (а не в подколлекции), чтобы обойти ограничения правил безопасности Firebase на вложенные коллекции.
