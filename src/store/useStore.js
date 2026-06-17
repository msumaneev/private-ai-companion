import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const generateId = () => Math.random().toString(36).substr(2, 9);

const idbStorage = {
  getItem: async (name) => {
    const { get } = await import('idb-keyval');
    let value = await get(name);
    if (!value) {
      const localValue = localStorage.getItem(name);
      if (localValue) {
        value = localValue;
      }
    }
    return value || null;
  },
  setItem: async (name, value) => {
    const { set } = await import('idb-keyval');
    await set(name, value);
    if (localStorage.getItem(name)) {
      localStorage.removeItem(name);
    }
  },
  removeItem: async (name) => {
    const { del } = await import('idb-keyval');
    await del(name);
  },
};

export const useStore = create(
  persist(
    (set, get) => ({
      characters: [],
      chats: [],
      activeChatId: null,
      apiKey: '',
      autoTranslate: true,
      favoriteModels: [],
      selectedModel: 'sao10k/l3.3-euryale-70b',

      setSelectedModel: (modelId) => set({ selectedModel: modelId }),

      toggleFavoriteModel: (modelId) => set((state) => ({
        favoriteModels: state.favoriteModels.includes(modelId)
          ? state.favoriteModels.filter(id => id !== modelId)
          : [...state.favoriteModels, modelId]
      })),

      setAutoTranslate: (val) => set({ autoTranslate: val }),
      setApiKey: (key) => set({ apiKey: key }),
      setActiveChatId: (id) => set({ activeChatId: id }),

      addCharacter: (character) => {
        const newChar = { 
          ...character, 
          id: generateId(),
          description: character.description || '',
          personality: character.personality || '',
          scenario: character.scenario || '',
          first_mes: character.first_mes || '',
          mes_example: character.mes_example || '',
          creator_notes: character.creator_notes || '',
          system_prompt: character.system_prompt || '',
          post_history_instructions: character.post_history_instructions || '',
        };
        set((state) => ({ characters: [...state.characters, newChar] }));
        return newChar;
      },

      updateCharacter: (id, updates) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        }));
      },

      importCharacter: (charData) => {
        const newChar = { 
          id: generateId(),
          name: charData.name || 'New Character',
          avatarBase64: charData.avatarBase64 || null,
          description: charData.description || '',
          personality: charData.personality || '',
          scenario: charData.scenario || '',
          first_mes: charData.first_mes || '',
          mes_example: charData.mes_example || '',
          creator_notes: charData.creator_notes || '',
          system_prompt: charData.system_prompt || '',
          post_history_instructions: charData.post_history_instructions || '',
        };
        set((state) => ({ characters: [...state.characters, newChar] }));
        return newChar;
      },

      addChat: (chat) => {
        const newChat = { 
          ...chat, 
          id: generateId(), 
          messages: chat.messages || [],
          createdAt: Date.now(),
          parentId: chat.parentId || null,
          summary: chat.summary || ''
        };
        set((state) => ({ chats: [...state.chats, newChat], activeChatId: newChat.id }));
        return newChat;
      },

      addMessageToChat: (chatId, message) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, messages: [...chat.messages, message] } : chat
          ),
        }));
      },

      clearChatMessages: (chatId) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, messages: [] } : chat
          ),
        }));
      },

      deleteMessageFromChat: (chatId, messageIndex) => {
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
              ...chat,
              messages: chat.messages.filter((_, idx) => idx !== messageIndex)
            };
          })
        }));
      },

      editMessageInChat: (chatId, messageIndex, newContent) => {
        set((state) => ({
          chats: state.chats.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((msg, idx) => 
                idx === messageIndex ? { ...msg, content: newContent } : msg
              )
            };
          })
        }));
      },

      deleteChat: (chatId) => {
        set((state) => {
          const newChats = state.chats.filter(c => c.id !== chatId);
          const newActiveChatId = state.activeChatId === chatId ? null : state.activeChatId;

          return {
            chats: newChats,
            activeChatId: newActiveChatId
          };
        });
      },

      deleteCharacter: (charId) => {
        set((state) => ({
          characters: state.characters.filter(c => c.id !== charId),
          chats: state.chats.filter(c => !(c.type === 'single' && c.characterIds.includes(charId))),
          activeChatId: state.chats.find(c => c.id === state.activeChatId && c.type === 'single' && c.characterIds.includes(charId)) ? null : state.activeChatId
        }));
      },
    }),
    {
      name: 'private-ai-companion-storage',
      storage: createJSONStorage(() => idbStorage),
    }
  )
);
