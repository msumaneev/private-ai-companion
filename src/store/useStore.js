import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useStore = create(
  persist(
    (set, get) => ({
      characters: [],
      chats: [],
      activeChatId: null,
      apiKey: '',

      setApiKey: (key) => set({ apiKey: key }),
      setActiveChatId: (id) => set({ activeChatId: id }),

      addCharacter: (character) => {
        const newChar = { ...character, id: generateId() };
        set((state) => ({ characters: [...state.characters, newChar] }));
        return newChar;
      },

      addChat: (chat) => {
        const newChat = { ...chat, id: generateId(), messages: [] };
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
    }),
    {
      name: 'private-ai-companion-storage',
    }
  )
);
