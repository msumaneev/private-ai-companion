/**
 * aiLogic.js
 * Бизнес-логика ИИ: Контекст, Триггеры, Anti-Loop.
 */

/**
 * 1. Anti-Loop Предохранитель
 * Проверяет, не зациклились ли боты в общении между собой.
 * Возвращает true, если боты написали 3 или более сообщений подряд без участия человека.
 */
export function isAiLooping(messages) {
  let consecutiveAiMessages = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // Роль 'user' - это сообщение от человека-клиента (независимо от того, хост он или гость)
    if (msg.role === 'user') {
      break;
    }
    if (msg.role === 'assistant') {
      consecutiveAiMessages++;
    }
  }
  return consecutiveAiMessages >= 3;
}

/**
 * 2. Менеджер Триггеров
 * Решает, должен ли конкретный ИИ (myAiId) реагировать на последнее сообщение в чате.
 */
export function shouldTriggerAi(messages, myAiId, totalParticipantsCount) {
  if (!messages || messages.length === 0) return false;
  const lastMessage = messages[messages.length - 1];

  // ИИ не должен отвечать на собственные сообщения (если только он не сломался и не тегнул сам себя)
  if (lastMessage.senderId === myAiId) return false;

  // Если в комнате только 2 участника (Ты и 1 ИИ), ИИ реагирует на каждое твое сообщение
  if (totalParticipantsCount <= 2) {
    return true;
  }

  // УСЛОВИЕ 1: Явное упоминание (Mentions/Target Lock)
  // Если массив mentions не пустой, реагируют ТОЛЬКО те, кто в нем указан.
  if (lastMessage.mentions && lastMessage.mentions.length > 0) {
    return lastMessage.mentions.includes(myAiId);
  }

  // УСЛОВИЕ 2: Ответ на реплику (Reply)
  if (lastMessage.replyToId) {
    const repliedMsg = messages.find(m => m.id === lastMessage.replyToId);
    // Если ответили именно этому ИИ - он триггерится
    if (repliedMsg && repliedMsg.senderId === myAiId) {
      return true;
    }
    // Если ответили кому-то другому, ИИ молчит
    return false;
  }

  // УСЛОВИЕ 3: Общее сообщение в чат
  // Сообщение не содержит упоминаний и не является ответом кому-то конкретному.
  // Разрешаем ИИ участвовать в беседе по умолчанию.
  return true;
}

/**
 * 3. Сборщик Контекста (Context Builder)
 * Трансформирует историю сообщений так, чтобы LLM понимала структуру мультиплеера.
 * Добавляет префиксы "[Имя] отвечает [Имя]:" в текст.
 */
export function buildContextForLlm(messages, profilesMap) {
  return messages.map(msg => {
    let prefix = '';
    
    // Определяем имя отправителя
    let senderName = 'Неизвестный';
    if (profilesMap[msg.senderId]) {
        senderName = profilesMap[msg.senderId].name;
    } else {
        senderName = msg.role === 'user' ? 'Пользователь' : 'ИИ';
    }
    
    // Формируем структуру ответа (Reply)
    if (msg.replyToId) {
      const repliedMsg = messages.find(m => m.id === msg.replyToId);
      if (repliedMsg) {
        let repliedName = 'Неизвестному';
        if (profilesMap[repliedMsg.senderId]) {
            repliedName = profilesMap[repliedMsg.senderId].name;
        } else {
            repliedName = repliedMsg.role === 'user' ? 'Пользователю' : 'ИИ';
        }
        prefix = `[${senderName}] отвечает [${repliedName}]:\n`;
      } else {
        prefix = `[${senderName}]:\n`;
      }
    } else {
      prefix = `[${senderName}]:\n`;
    }

    return {
      role: msg.role,
      content: prefix + msg.content
    };
  });
}
