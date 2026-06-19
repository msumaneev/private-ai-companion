import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { compressImage } from './utils/imageCompressor';
import TextareaAutosize from 'react-textarea-autosize';
import { Send, User, Menu, X, Plus, Users, Image as ImageIcon, Sparkles, BookOpen, Bot, Settings, Trash2, Eraser, Star, ArrowDown, Pencil, Check, ChevronDown, ChevronRight, Loader2, GitBranch, Reply, Link2, Copy, MoreVertical, UserPlus } from 'lucide-react';
import { useStore } from './store/useStore';
import scenarios from './data/scenarios.json';
import { parseTavernCard } from './utils/pngParser';
import { subscribeToRoom, sendMessage, publishRoomMetadata, fetchRoomMetadata } from './utils/firebaseService';
import { importKey, encryptMessage, decryptMessage, generateKey, exportKey } from './utils/cryptoUtils';

const replaceMacros = (text, charName, userName) => {
  if (!text) return text;
  return text
    .replace(/{{char}}/gi, charName || 'Персонаж')
    .replace(/{{user}}/gi, userName || 'Пользователь')
    .replace(/<USER>/gi, userName || 'Пользователь')
    .replace(/<BOT>/gi, charName || 'Персонаж');
};

const AVAILABLE_MODELS = [
  { id: 'sao10k/l3.3-euryale-70b', name: 'Euryale Llama 3.3 70B (Uncensored)' },
  { id: 'anthracite-org/magnum-v4-72b', name: 'Magnum v4 72B (Uncensored)' },
  { id: 'alpindale/goliath-120b', name: 'Goliath 120B (Uncensored)' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b', name: 'Hermes 3 405B (Uncensored)' },
  { id: 'sophosympatheia/midnight-miqu-14x8b', name: 'Midnight Miqu 103B (Uncensored)' },
  { id: 'neversleep/noromaid-20b', name: 'Noromaid 20B (Uncensored)' },
];

const CollapsibleField = ({ label, value, onChange, placeholder }) => {
  const [expanded, setExpanded] = useState(false);
  const isEmpty = !value || value.trim() === '';

  return (
    <div className="mb-3 bg-white/30 backdrop-blur-sm rounded-xl border border-white/50 overflow-hidden transition-all">
      <div 
        className="flex justify-between items-start p-3 cursor-pointer hover:bg-white/40 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 overflow-hidden pr-2">
          <h4 className="text-sm font-semibold text-slate-800">{label}</h4>
          {!expanded && (
            <p className="text-xs text-slate-800/60 line-clamp-2 mt-1 break-words whitespace-pre-wrap">
              {isEmpty ? <span className="italic opacity-50">Пусто...</span> : value}
            </p>
          )}
        </div>
        <button className="text-slate-800/40 p-1 shrink-0 mt-0.5" type="button">
          <ChevronDown className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && (
        <div className="p-3 pt-0">
          <TextareaAutosize 
            minRows={3}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 bg-white/50"
          />
        </div>
      )}
    </div>
  );
};

function App() {
  const { characters, chats, activeChatId, apiKey, setApiKey, autoTranslate, setAutoTranslate, setActiveChatId, addCharacter, updateCharacter, importCharacter, addChat, addMessageToChat, clearChatMessages, deleteChat, deleteCharacter, favoriteModels, toggleFavoriteModel, selectedModel, setSelectedModel, deleteMessageFromChat, editMessageInChat, updateChatSummary, updateChatField, userName, setUserName, userAvatar, userDescription, syncNetworkMessages, addCharacterToChat, syncFullChat } = useStore();
  
  const [networkRoomId, setNetworkRoomId] = useState(null);
  const [networkKey, setNetworkKey] = useState(null);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) {
      const params = new URLSearchParams(hash.substring(1));
      const rId = params.get('room');
      const kStr = params.get('key');
      if (rId && kStr) {
        setNetworkRoomId(rId);
        importKey(kStr).then(async (key) => {
            setNetworkKey(key);
            const encryptedMetadata = await fetchRoomMetadata(rId);
            if (encryptedMetadata) {
                try {
                    const metadata = await decryptMessage(encryptedMetadata, key);
                    
                    if (metadata.syncMode === true) {
                        clientIdRef.current = metadata.hostClientId;
                        syncFullChat(metadata);
                        window.history.replaceState(null, null, ' ');
                        return; // Пропускаем окно Lobby
                    }

                    if (metadata.characters) {
                        const currentChars = useStore.getState().characters;
                        const charMap = new Set(currentChars.map(c => c.id));
                        metadata.characters.forEach(char => {
                            if (!charMap.has(char.id)) {
                                useStore.getState().addCharacter(char);
                            }
                        });
                    }
                    if (metadata.chat) {
                        const currentChats = useStore.getState().chats;
                        const chatExists = currentChats.some(c => c.id === metadata.chat.id);
                        if (!chatExists) {
                            useStore.getState().addChat(metadata.chat);
                        } else {
                            useStore.getState().setActiveChatId(metadata.chat.id);
                        }
                    }
                    openLobbyModal();
                } catch (e) {
                    console.error("Failed to decrypt metadata", e);
                }
            }
        });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!networkRoomId || !networkKey || !activeChatId) return;
    const unsubscribe = subscribeToRoom(networkRoomId, async (encryptedMessages) => {
        const decryptedMessages = [];
        const currentChat = useStore.getState().chats.find(c => c.id === activeChatId);
        let networkUsers = currentChat?.networkUsers || [];
        let updatedNetworkUsers = false;

        for (const msg of encryptedMessages) {
             try {
                 const decryptedObj = await decryptMessage(msg.encryptedText, networkKey);
                 
                 let eventType = decryptedObj.type;
                 let payload = decryptedObj.payload;

                 // Backward compatibility for old raw messages
                 if (!eventType) {
                     eventType = 'MESSAGE';
                     payload = decryptedObj;
                 }

                 if (eventType === 'USER_JOINED') {
                     const guest = decryptedObj.user;
                     if (guest.id !== clientIdRef.current && !networkUsers.find(u => u.id === guest.id)) {
                         networkUsers = [...networkUsers, guest];
                         updatedNetworkUsers = true;
                         
                         decryptedMessages.push({
                             id: msg.id,
                             role: 'assistant',
                             name: 'Система',
                             content: `[Система]: Пользователь ${guest.name} присоединился к чату. Описание: ${guest.description || 'Нет описания'}`
                         });
                     }
                 } else if (eventType === 'MESSAGE') {
                     decryptedMessages.push({ ...payload, id: msg.id });
                 }
             } catch (e) {
                 console.error("Failed to decrypt", e);
             }
        }
        
        if (updatedNetworkUsers) {
            useStore.getState().updateChatField(activeChatId, 'networkUsers', networkUsers);
        }
        if (decryptedMessages.length > 0) {
            syncNetworkMessages(activeChatId, decryptedMessages);
        }
    });
    return () => unsubscribe();
  }, [networkRoomId, networkKey, activeChatId, syncNetworkMessages]);
  

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' | 'stories'
  const [expandedCharacters, setExpandedCharacters] = useState({});
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryModalChatId, setSummaryModalChatId] = useState(null);
  const [summaryModalText, setSummaryModalText] = useState("");
  
  const [showContactModal, setShowContactModal] = useState(false);
  const [showAddCharacterModal, setShowAddCharacterModal] = useState(false);
  const [showChubModal, setShowChubModal] = useState(false);
  const [chubQuery, setChubQuery] = useState('');
  const [chubIncludeNsfw, setChubIncludeNsfw] = useState(true);
  const [chubIncludeVenus, setChubIncludeVenus] = useState(true);
  const [chubResults, setChubResults] = useState([]);
  const [isChubLoading, setIsChubLoading] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showChatHeaderMenu, setShowChatHeaderMenu] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [input, setInput] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempUserName, setTempUserName] = useState('');
  const [tempChatUserName, setTempChatUserName] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');
  const messagesEndRef = useRef(null);

  const [mentions, setMentions] = useState([]);
  const [replyToId, setReplyToId] = useState(null);

  const [newContactName, setNewContactName] = useState('');
  const [newContactPrompt, setNewContactPrompt] = useState('');
  const [newContactAvatar, setNewContactAvatar] = useState(null);
  const [newContactDescription, setNewContactDescription] = useState('');
  const [newContactPersonality, setNewContactPersonality] = useState('');
  const [newContactScenario, setNewContactScenario] = useState('');
  const [newContactFirstMes, setNewContactFirstMes] = useState('');
  const [newContactMesExample, setNewContactMesExample] = useState('');
  const [contactModalTab, setContactModalTab] = useState('main');
  const [editingCharId, setEditingCharId] = useState(null);
  const [isTranslatingCard, setIsTranslatingCard] = useState(false);

  const [selectedScenario, setSelectedScenario] = useState(null);
  const [storySlots, setStorySlots] = useState({});
  const [isCreatingCustomScenario, setIsCreatingCustomScenario] = useState(false);
  const [customScenarioData, setCustomScenarioData] = useState({ title: '', world_context: '', required_characters_count: 2 });


  const [balance, setBalance] = useState(null);

  const activeChat = chats.find(c => c.id === activeChatId);

  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [lobbyUserName, setLobbyUserName] = useState('');
  const [lobbyUserAvatar, setLobbyUserAvatar] = useState(null);
  const [lobbyUserDescription, setLobbyUserDescription] = useState('');
  const clientIdRef = useRef(Math.random().toString(36).substr(2, 9));

  const openLobbyModal = () => {
      setLobbyUserName(activeChat?.userName || userName || '');
      setLobbyUserAvatar(activeChat?.userAvatar || userAvatar || null);
      setLobbyUserDescription(activeChat?.userDescription || userDescription || '');
      setShowLobbyModal(true);
  };

  const saveLobbyProfile = async () => {
      if (activeChatId) {
          updateChatField(activeChatId, 'userName', lobbyUserName);
          updateChatField(activeChatId, 'userAvatar', lobbyUserAvatar);
          updateChatField(activeChatId, 'userDescription', lobbyUserDescription);
      }
      if (networkRoomId && networkKey) {
          try {
              const eventPayload = {
                  type: 'USER_JOINED',
                  user: {
                      id: clientIdRef.current,
                      name: lobbyUserName,
                      avatar: lobbyUserAvatar,
                      description: lobbyUserDescription
                  }
              };
              const enc = await encryptMessage(eventPayload, networkKey);
              await sendMessage(networkRoomId, enc);
          } catch(e) { console.error("Broadcast failed", e); }
      }
      setShowLobbyModal(false);
  };

  const handleInvite = async (mode = 'multiplayer') => {
    if (!activeChat) return;
    try {
        const key = await generateKey();
        const keyStr = await exportKey(key);
        const rId = Math.random().toString(36).substr(2, 9);
        
        const chatChars = activeChat.characterIds ? activeChat.characterIds.map(id => characters.find(c => c.id === id)).filter(Boolean) : [];
        
        let chatMetadata;
        let metadata;
        if (mode === 'sync') {
            chatMetadata = { ...activeChat };
            metadata = { chat: chatMetadata, characters: chatChars, syncMode: true, hostClientId: clientIdRef.current };
        } else {
            chatMetadata = { ...activeChat, messages: [] };
            metadata = { chat: chatMetadata, characters: chatChars };
        }
        
        const encryptedMetadata = await encryptMessage(metadata, key);
        await publishRoomMetadata(rId, encryptedMetadata);
        
        setNetworkRoomId(rId);
        setNetworkKey(key);
        
        const link = `${window.location.origin}/#room=${rId}&key=${keyStr}`;
        setInviteLink(link);
    } catch (e) {
        console.error("Failed to generate invite", e);
    }
  };
  const [showScrollButton, setShowScrollButton] = useState(false);  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };
  const fetchBalance = async () => {
    if (!apiKey) return;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await response.json();
      if (data.data && typeof data.data.total_credits === 'number') {
        setBalance(data.data.total_credits - data.data.total_usage);
      } else {
        // Fallback for older keys or if /credits is not available
        const keyResponse = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const keyData = await keyResponse.json();
        setBalance(keyData.data?.limit ? (keyData.data.limit - keyData.data.usage) : null);
      }
    } catch (e) {
      console.error('Failed to fetch balance', e);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [apiKey]);

  useEffect(() => {
    if (!showScrollButton) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChat?.messages, isTyping]);

  const handleImageUpload = (e, setAvatar) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result, 400, 400);
        setAvatar(compressed);
      };
      reader.readAsDataURL(file);
    }
  };


  const openEditContact = (char) => {
    setEditingCharId(char.id);
    setNewContactName(char.name || '');
    setNewContactAvatar(char.avatarBase64 || null);
    setNewContactPrompt(char.system_prompt || '');
    setNewContactDescription(char.description || '');
    setNewContactPersonality(char.personality || '');
    setNewContactScenario(char.scenario || '');
    setNewContactFirstMes(char.first_mes || '');
    setNewContactMesExample(char.mes_example || '');
    setContactModalTab('main');
    setShowContactModal(true);
  };
  const createContact = () => {
    if (!newContactName) return;
    
    if (editingCharId) {
      updateCharacter(editingCharId, {
        name: newContactName,
        system_prompt: newContactPrompt,
        avatarBase64: newContactAvatar,
        description: newContactDescription,
        personality: newContactPersonality,
        scenario: newContactScenario,
        first_mes: newContactFirstMes,
        mes_example: newContactMesExample,
      });
    } else {
      const newChar = addCharacter({
        name: newContactName,
        system_prompt: newContactPrompt,
        avatarBase64: newContactAvatar,
        description: newContactDescription,
        personality: newContactPersonality,
        scenario: newContactScenario,
        first_mes: newContactFirstMes,
        mes_example: newContactMesExample,
      });
      
      const newChat = addChat({
        type: 'single',
        name: newContactName,
        avatarBase64: newContactAvatar,
        characterIds: [newChar.id]
      });

      if (newChar.first_mes) {
        addMessageToChat(newChat.id, { role: 'assistant', content: newChar.first_mes, name: newChar.name });
      }
    }
    
    setNewContactName('');
    setNewContactPrompt('');
    setNewContactDescription('');
    setNewContactPersonality('');
    setNewContactScenario('');
    setNewContactFirstMes('');
    setNewContactMesExample('');
    setNewContactAvatar(null);
    setContactModalTab('main');
    setEditingCharId(null);
    setShowContactModal(false);
  };

  const searchChub = async (e) => {
    e.preventDefault();
    if (!chubQuery) return;
    setIsChubLoading(true);
    try {
      let searchUrl = `https://api.chub.ai/search?search=${encodeURIComponent(chubQuery)}&first=30`;
      if (chubIncludeNsfw) searchUrl += '&nsfw=true';
      if (chubIncludeVenus) searchUrl += '&venus=true';
      const res = await fetch(searchUrl);
      const data = await res.json();
      const nodes = data.data?.nodes || data.nodes || [];
      
      // Показываем результаты сразу
      setChubResults(nodes);
      
      // Асинхронно переводим описания через Google Translate (бесплатный API)
      const translateNodes = async () => {
        let currentNodes = [...nodes];
        for (let i = 0; i < currentNodes.length; i++) {
          const char = currentNodes[i];
          const text = char.tagline || char.description || '';
          if (text) {
            try {
              const trRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(text.slice(0, 500))}`)}`);
              const trData = await trRes.json();
              let translatedText = '';
              if (trData && trData[0]) {
                trData[0].forEach(t => { if (t[0]) translatedText += t[0] });
              }
              if (translatedText) {
                currentNodes[i] = { ...char, translatedTagline: translatedText };
                setChubResults([...currentNodes]);
              }
            } catch (err) {
              // Игнорируем ошибки перевода, чтобы не спамить
            }
          }
        }
      };
      
      translateNodes();
      
    } catch (err) {
      alert('Ошибка поиска: ' + err.message);
    }
    setIsChubLoading(false);
  };

  const importFromChub = async (fullPath) => {
    try {
      const pngRes = await fetch(`https://avatars.charhub.io/avatars/${fullPath}/chara_card_v2.png`);
      if (!pngRes.ok) throw new Error('Не удалось скачать карточку персонажа (chara_card_v2.png не найден)');
      const blob = await pngRes.blob();
      const file = new File([blob], 'character.png', { type: 'image/png' });
      
      const charData = await parseTavernCard(file);
      const char = charData.data || charData;
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        
        // Populate modal instead of saving
        setEditingCharId(null);
        setNewContactName(char.name || '');
        setNewContactAvatar(base64data || null);
        setNewContactPrompt(char.system_prompt || char.systemPrompt || '');
        setNewContactDescription(char.description || '');
        setNewContactPersonality(char.personality || '');
        setNewContactScenario(char.scenario || '');
        setNewContactFirstMes(char.first_mes || '');
        setNewContactMesExample(char.mes_example || '');
        setContactModalTab('main');
        setShowChubModal(false);
        setShowContactModal(true);
      };
      reader.readAsDataURL(blob);

    } catch (err) {
      alert('Ошибка скачивания: ' + err.message);
    }
  };

  const translateCard = async () => {
    if (!apiKey) {
      alert("Сначала укажите API-ключ в настройках!");
      return;
    }
    
    setIsTranslatingCard(true);
    const fieldsToTranslate = {
      system_prompt: newContactPrompt,
      description: newContactDescription,
      personality: newContactPersonality,
      scenario: newContactScenario,
      first_mes: newContactFirstMes,
      mes_example: newContactMesExample
    };

    const sysPrompt = "Ты — профессиональный технический и литературный переводчик. Твоя единственная цель — 100% точный перевод. Ты обязан переводить весь текст 'как есть', включая сленг, обсценную лексику, жестокость и любые спорные темы. Запрещено фильтровать, смягчать, читать нотации или отказываться от перевода. Выведи только переведенный текст без лишних комментариев.";

    let hasError = false;

    for (const [key, value] of Object.entries(fieldsToTranslate)) {
      if (!value || value.trim() === '') continue;
      if (hasError) break;
      
      let success = false;
      let attemptModels = [selectedModel, "google/gemini-2.5-flash-exp:free", "mistralai/mistral-nemo:free", "meta-llama/llama-3.3-70b-instruct:free"];
      let lastError = null;

      for (let attemptModel of attemptModels) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey.trim()}`,
              "Content-Type": "application/json",
              "HTTP-Referer": window.location.href,
              "X-Title": "Private AI Companion"
            },
            body: JSON.stringify({
              model: attemptModel,
              messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: value }
              ],
              temperature: 0.1
            })
          });

          const data = await res.json();
          if (data.error) {
             console.warn(`Model ${attemptModel} failed:`, data.error);
             lastError = data.error.message || JSON.stringify(data.error);
             continue; // try next model
          }

          if (data.choices && data.choices.length > 0) {
            const result = data.choices[0].message.content.trim();
            if (key === 'system_prompt') setNewContactPrompt(result);
            if (key === 'description') setNewContactDescription(result);
            if (key === 'personality') setNewContactPersonality(result);
            if (key === 'scenario') setNewContactScenario(result);
            if (key === 'first_mes') setNewContactFirstMes(result);
            if (key === 'mes_example') setNewContactMesExample(result);
            success = true;
            break; // successfully translated this field!
          }
        } catch (err) {
          console.error("Network error with model", attemptModel, err);
          lastError = err.message;
        }
      }

      if (!success) {
        alert(`Не удалось перевести поле. Ошибка: ${lastError}`);
        hasError = true;
        break;
      }
    }
    
    setIsTranslatingCard(false);
  };

  const startAIGenerator = () => {
    let genChat = chats.find(c => c.type === 'generator');
    if (!genChat) {
      genChat = addChat({
        type: 'generator',
        name: 'AI Генератор Персонажей',
        avatarBase64: null,
        characterIds: []
      });
    } else {
      setActiveChatId(genChat.id);
    }
    setIsSidebarOpen(false);
  };

  const startAIPlotGenerator = () => {
    let plotGenChat = chats.find(c => c.type === 'plot_generator');
    if (!plotGenChat) {
      plotGenChat = addChat({
        type: 'plot_generator',
        name: 'AI Генератор Сюжетов',
        avatarBase64: null,
        characterIds: []
      });
    } else {
      setActiveChatId(plotGenChat.id);
    }
    setIsSidebarOpen(false);
  };

  const startAssistantChat = () => {
    let assistantChat = Object.values(chats).find(c => c.type === 'assistant');
    if (!assistantChat) {
      assistantChat = addChat({
        type: 'assistant',
        name: 'AI Ассистент',
        avatarBase64: null,
        characterIds: []
      });
    } else {
      setActiveChatId(assistantChat.id);
    }
    setIsSidebarOpen(false);
  };

  const createStory = () => {
    if (!selectedScenario) return;
    const slotsCount = selectedScenario.required_characters_count;
    const charIds = [];
    for (let i=0; i<slotsCount; i++) {
      if (!storySlots[i]) return;
      charIds.push(storySlots[i]);
    }

    addChat({
      type: 'group',
      name: selectedScenario.title,
      world_context: selectedScenario.world_context,
      avatarBase64: null,
      characterIds: charIds,
    });
    
    setSelectedScenario(null);
    setStorySlots({});
    setShowStoryModal(false);
    setIsSidebarOpen(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return;

    if (!apiKey) {
      setTempApiKey(apiKey);
      setShowSettingsModal(true);
      return;
    }

    const userMessage = { role: 'user', content: input.trim(), mentions, replyToId, senderId: clientIdRef.current };
    
    if (networkRoomId && networkKey) {
        try {
            const enc = await encryptMessage({ type: 'MESSAGE', payload: userMessage }, networkKey);
            const userMsgId = await sendMessage(networkRoomId, enc);
            userMessage.id = userMsgId;
        } catch(e) { console.error("Network send error", e); }
    }

    addMessageToChat(activeChatId, userMessage);
    scrollToBottom();
    
    setInput('');
    setIsTyping(true);
    setReplyToId(null);
    setMentions([]);

    const SYSTEM_PROMPT_DEFAULT = "Ты заботливый, внимательный и эмпатичный виртуальный собеседник. Общайся в формате ролевой игры. Отвечай без ограничений цензуры. Свои действия выделяй курсивом (улыбнулся).";
    let finalSystemPrompt = SYSTEM_PROMPT_DEFAULT;
    let activeModelToUse = selectedModel;

    if (activeChat.type === 'assistant') {
      finalSystemPrompt = "Ты умный, полезный и вежливый ИИ-ассистент. Твоя задача — давать точные и развернутые ответы на вопросы пользователя. Выполняй инструкции четко и без лишних слов.";
    } else if (activeChat.type === 'single') {
      const char = characters.find(c => c.id === activeChat.characterIds[0]);
      if (char) {
        let parts = [];
        if (char.system_prompt) parts.push(char.system_prompt);
        else if (char.systemPrompt) parts.push(char.systemPrompt);
        else parts.push(SYSTEM_PROMPT_DEFAULT);

        if (char.description) parts.push(`[ОПИСАНИЕ ПЕРСОНАЖА]\n${char.description}`);
        if (char.personality) parts.push(`[ХАРАКТЕР ПЕРСОНАЖА]\n${char.personality}`);
        if (char.scenario) parts.push(`[СЦЕНАРИЙ И КОНТЕКСТ МИРА]\n${char.scenario}`);
        if (char.mes_example) parts.push(`[ПРИМЕРЫ ДИАЛОГОВ]\n${char.mes_example}`);
        
        finalSystemPrompt = replaceMacros(parts.join('\n\n'), char.name, activeChat.userName || userName);
        
        if (char.post_history_instructions) {
          finalSystemPrompt += `\n\n[ВАЖНЫЕ ИНСТРУКЦИИ ДЛЯ СЛЕДУЮЩЕГО ОТВЕТА]\n${char.post_history_instructions}`;
        }
      }
    } else if (activeChat.type === 'group') {
      const charsDesc = activeChat.characterIds.map((id, i) => {
        if (id === 'USER') return `${i + 1}) Пользователь: Человек, с которым вы сейчас общаетесь. ИИ КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ придумывать действия или реплики за Пользователя.`;
        const char = characters.find(c => c.id === id);
        if (!char) return null;
        let charContext = `${i + 1}) ${char.name}:`;
        if (char.description || char.personality) charContext += ` ${char.description || ''} ${char.personality || ''}`;
        else charContext += ` ${char.systemPrompt || ''}`;
        return charContext;
      }).filter(Boolean).join('. ');
      finalSystemPrompt = `[ГЛОБАЛЬНЫЙ СЦЕНАРИЙ]: ${activeChat.world_context || ''}. [УЧАСТНИКИ]: ${charsDesc}. СТРОГОЕ ПРАВИЛО: Каждую свою реплику начинай с имени персонажа в формате "Имя:". Отвечай только за заявленных персонажей. Никогда не пиши действия или реплики за Пользователя.`;
      
      if (mentions && mentions.length > 0) {
        const mentionedNames = mentions.map(id => characters.find(c => c.id === id)?.name).filter(Boolean);
        if (mentionedNames.length > 0) {
          finalSystemPrompt += `\n\n[ВНИМАНИЕ: Пользователь обращается персонально к: ${mentionedNames.join(', ')}. Ответить должны ИМЕННО эти персонажи.]`;
        }
      }
    } else if (activeChat.type === 'generator') {
      finalSystemPrompt = `Ты — эксперт по созданию глубоких, живых и нешаблонных персонажей для ролевых игр. Пользователь опишет тебе свою идею. Твоя задача — придумать реалистичное имя, характер, скрытые мотивы.\n\nКогда анкета согласована, ты ОБЯЗАН выдать результат в формате JSON внутри тегов <character type="application/json">. Структура: { "name": "Имя", "avatar_emoji": "🎭", "system_prompt": "Промпт (роль и поведение)", "description": "Внешность", "personality": "Характер", "scenario": "Сценарий/Мир", "first_mes": "Первое сообщение", "mes_example": "Пример диалогов" }`;
    } else if (activeChat.type === 'plot_generator') {
      finalSystemPrompt = `Ты — эксперт по созданию увлекательных сценариев (сюжетов) для текстовых ролевых игр. Пользователь опишет свою задумку, а ты должен помочь развить ее в полноценный сеттинг.\n\nЗадавай уточняющие вопросы, предлагай интересные конфликты и завязки. Когда сюжет согласован, помоги пользователю красиво сформулировать "Название сюжета" и "Контекст/Сеттинг" для создания сценария в приложении. Форматируй свой ответ красиво, используя markdown.`;
    }

    if (activeChat.summary) {
      finalSystemPrompt += `\n\n[РЕТРОСПЕКТИВА ПРЕДЫДУЩИХ СОБЫТИЙ]:\n${activeChat.summary}\nОпирайся на эту информацию для бесшовного продолжения истории. Не нужно пересказывать её, просто учитывай в своих ответах.`;
    }

    if (autoTranslate) {
      finalSystemPrompt += "\n\n[ВАЖНО: АБСОЛЮТНО ВСЕ СВОИ ОТВЕТЫ, ДЕЙСТВИЯ, МЫСЛИ И РЕПЛИКИ ТЫ ОБЯЗАН ПЕРЕВОДИТЬ И ПИСАТЬ ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ. ДАЖЕ ЕСЛИ ПЕРСОНАЖ АНГЛОЯЗЫЧНЫЙ, ТЫ ПЕРЕВОДИШЬ ЕГО РЕПЛИКИ НА РУССКИЙ КАЧЕСТВЕННЫМ ХУДОЖЕСТВЕННЫМ СТИЛЕМ. DO NOT USE ENGLISH, RUSSIAN ONLY.]";
    }

    const updatedMessages = [...activeChat.messages, userMessage];
    const openRouterMessages = [
      { role: 'system', content: finalSystemPrompt },
      ...updatedMessages
    ];

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'Private AI Companion'
        },
        body: JSON.stringify({ 
          models: [activeModelToUse, "meta-llama/llama-3.3-70b-instruct", "mistralai/mistral-nemo"], 
          route: "fallback",
          messages: openRouterMessages 
        }),
      });

      if (!response.ok) {
        let errorMsg = `Ошибка API: ${response.status}`;
        if (response.status === 404) errorMsg = 'Модель недоступна (404). Проверьте лимиты, провайдеров или настройки приватности на OpenRouter.';
        if (response.status === 401) errorMsg = 'Неверный API ключ (401).';
        if (response.status === 402) errorMsg = 'Недостаточно средств на балансе (402).';
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      const aiMessage = data.choices?.[0]?.message;
      
      if (aiMessage) {
        if (networkRoomId && networkKey) {
           try {
               const enc = await encryptMessage({ type: 'MESSAGE', payload: aiMessage }, networkKey);
               const aiMsgId = await sendMessage(networkRoomId, enc);
               aiMessage.id = aiMsgId;
           } catch(e) { console.error("Network send error", e); }
        }
        addMessageToChat(activeChatId, aiMessage);
        fetchBalance();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      addMessageToChat(activeChatId, { role: 'assistant', content: `_Ошибка: ${error.message}_` });
    } finally {
      setIsTyping(false);
    }
  };

  const parseMessageContent = (content, chatType) => {
    if (chatType === 'single' || chatType === 'generator' || chatType === 'plot_generator') return { speaker: null, text: content };
    const match = content.match(/^([^:]+):\s*(.*)/s);
    if (match) {
      return { speaker: match[1].trim(), text: match[2] };
    }
    return { speaker: null, text: content };
  };

  const extractCharacterJSON = (content) => {
    const match = content.match(/<character[^>]*>([\s\S]*?)<\/character>/);
    if (match) {
      try { return JSON.parse(match[1]); } catch(e) { return null; }
    }
    return null;
  };

  const saveExtractedCharacter = (charData) => {
    addCharacter({
      name: charData.name,
      systemPrompt: charData.system_prompt,
      avatarBase64: charData.avatar_emoji,
    });
    alert(`Персонаж ${charData.name} добавлен в контакты!`);
  };

  const renderAvatar = (avatarBase64) => {
    if (!avatarBase64) return <User className="text-indigo-400 w-5 h-5" />;
    if (avatarBase64.length < 10) return <span className="text-xl">{avatarBase64}</span>;
    return <img src={avatarBase64} className="w-full h-full object-cover" />;
  };

  const getGroupedContacts = () => {
    const singleChats = chats.filter(c => c.type === 'single' || c.type === 'generator');
    const grouped = {};
    const generators = [];

    characters.forEach(char => {
      grouped[char.id] = [];
    });

    singleChats.forEach(chat => {
      if (chat.type === 'generator') {
        generators.push(chat);
        return;
      }
      const charId = chat.characterIds[0];
      if (!charId) return;
      if (!grouped[charId]) {
        grouped[charId] = [];
      }
      grouped[charId].push(chat);
    });

    Object.keys(grouped).forEach(charId => {
      grouped[charId].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    });

    return { grouped, generators };
  };

  const toggleCharacterAccordion = (charId, e) => {
    if (e) e.stopPropagation();
    setExpandedCharacters(prev => ({ ...prev, [charId]: !prev[charId] }));
  };

  const handleSummarizeChat = async () => {
    if (!activeChat || activeChat.messages.length === 0 || !apiKey) return;
    
    setIsSummarizing(true);
    
    const messagesText = activeChat.messages.map(m => `${m.role === 'user' ? 'Пользователь' : 'Персонаж'}: ${m.content}`).join('\n\n');
    const summaryPrompt = `Сделай подробный пересказ предоставленной истории ролевой игры. Сфокусируйся на отношениях между персонажем и пользователем. Опиши текущую сцену, важные факты и чем всё закончилось.\nВАЖНО: Пиши только сам пересказ (от 3 лица). Не извиняйся, не задавай вопросов, не комментируй.\n\n[ИСТОРИЯ ЧАТА]:\n${messagesText}`;
    
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'Private AI Companion'
        },
        body: JSON.stringify({ 
          model: selectedModel || "meta-llama/llama-3.3-70b-instruct",
          messages: [
            { role: 'system', content: 'Ты полезный ИИ-ассистент. Твоя единственная задача — составлять сухие, точные и детальные саммари (пересказы) логов ролевых игр. Ты не задаешь вопросов и не отказываешься от задачи.' },
            { role: 'user', content: summaryPrompt }
          ],
          temperature: 0.3,
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'API Error: ' + response.status);
      }
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const summaryText = data.choices[0].message.content;
        
        // Create new chat
        const newChat = addChat({
          type: activeChat.type,
          name: activeChat.name,
          characterIds: activeChat.characterIds,
          avatarBase64: activeChat.avatarBase64,
          parentId: activeChat.id,
          summary: summaryText
        });
        
        setActiveChatId(newChat.id);
      }
    } catch (error) {
      console.error('Summarization failed:', error);
      alert(`Ошибка при создании пересказа: ${error.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-transparent relative overflow-hidden">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}/>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-80 bg-white/40 backdrop-blur-xl border border-white/50 shadow-xl z-30 transform transition-transform duration-300 md:relative md:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-white/40 flex justify-between items-center bg-white/50/50">
          <div>
            <h2 className="font-bold text-slate-800 text-lg leading-tight">Private AI</h2>
            {balance !== null && <p className="text-xs text-green-600 font-medium mt-0.5">Баланс: ${typeof balance === 'number' ? balance.toFixed(2) : balance}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button className="text-slate-800/70 hover:text-violet-500 transition p-1" onClick={() => { setTempApiKey(apiKey); setTempUserName(userName); setShowSettingsModal(true); }}>
              <Settings className="w-5 h-5" />
            </button>
            <button className="md:hidden text-slate-800/70 p-1" onClick={() => setIsSidebarOpen(false)}>
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-white/40 shrink-0">
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'contacts' ? 'text-violet-500 border-b-2 border-indigo-600' : 'text-slate-800/70 hover:text-slate-800/90'}`}
            onClick={() => setActiveTab('contacts')}
          >
            <User className="w-4 h-4" /> Контакты
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'stories' ? 'text-violet-500 border-b-2 border-indigo-600' : 'text-slate-800/70 hover:text-slate-800/90'}`}
            onClick={() => setActiveTab('stories')}
          >
            <BookOpen className="w-4 h-4" /> Сюжеты
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === 'contacts' ? (() => {
            const { grouped, generators } = getGroupedContacts();
            const characterIds = Object.keys(grouped);
            
            return (
              <>
                {generators.map(chat => (
                  <div 
                    key={chat.id} 
                    onClick={() => { setActiveChatId(chat.id); setIsSidebarOpen(false); }}
                    className={`flex items-center p-3 rounded-xl cursor-pointer transition-colors mb-1 ${activeChatId === chat.id ? 'bg-white/50' : 'hover:bg-white/60'}`}
                  >
                    <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0">
                      <Bot className="text-violet-500 w-5 h-5" />
                    </div>
                    <div className="overflow-hidden flex-1">
                      <h3 className="font-medium text-slate-800 text-sm truncate">{chat.name}</h3>
                      <p className="text-xs text-slate-800/70 truncate">Служебный чат</p>
                    </div>
                  </div>
                ))}

                {characterIds.map(charId => {
                  const char = characters.find(c => c.id === charId);
                  if (!char) return null;
                  const charChats = grouped[charId];
                  const isExpanded = expandedCharacters[charId];
                  
                  return (
                    <div key={charId} className="mb-1">
                      <div 
                        onClick={() => toggleCharacterAccordion(charId)}
                        className="flex items-center p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/60 group"
                      >
                        <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0">
                          {renderAvatar(char.avatarBase64)}
                        </div>
                        <div className="overflow-hidden flex-1">
                          <h3 className="font-medium text-slate-800 text-sm truncate">{char.name}</h3>
                          <p className="text-xs text-slate-800/70 truncate">{charChats.length} {charChats.length === 1 ? 'глава' : (charChats.length < 5 ? 'главы' : 'глав')}</p>
                        </div>
                        <div className="flex items-center">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              openEditContact(char); 
                            }} 
                            className="p-2 text-slate-800/40 hover:text-violet-500 hover:bg-white/40 rounded-lg transition-colors mr-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-800/40" /> : <ChevronRight className="w-4 h-4 text-slate-800/40" />}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="ml-10 pl-3 py-1 border-l-2 border-white/40 space-y-1">
                          {charChats.map((chat, idx) => (
                            <div 
                              key={chat.id}
                              onClick={() => { setActiveChatId(chat.id); setIsSidebarOpen(false); }}
                              className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors group/chat ${activeChatId === chat.id ? 'bg-violet-400 text-white shadow-sm' : 'hover:bg-white/50 text-slate-800'}`}
                            >
                              <div className="flex-1 truncate text-sm">
                                <GitBranch className={`w-3 h-3 inline-block mr-1 ${activeChatId === chat.id ? 'text-white' : 'opacity-50'}`} />
                                Глава {idx + 1}
                              </div>
                              <div className="flex">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSummaryModalChatId(chat.id);
                                    setSummaryModalText(chat.summary || "");
                                    setTempChatUserName(chat.userName || "");
                                  }}
                                  className={`p-1 rounded opacity-0 group-hover/chat:opacity-100 transition-colors mr-1 ${chat.summary ? (activeChatId === chat.id ? 'text-white hover:bg-white/20' : 'text-amber-500 hover:bg-amber-500/20') : (activeChatId === chat.id ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200')}`}
                                  title="Память (Саммари) этой главы"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Удалить эту главу?')) deleteChat(chat.id);
                                  }}
                                  className={`p-1 rounded opacity-0 group-hover/chat:opacity-100 hover:bg-red-500/20 hover:text-red-500 transition-colors ${activeChatId === chat.id ? 'text-white/80' : 'text-slate-400'}`}
                                  title="Удалить главу"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const newChat = addChat({
                                type: 'single',
                                name: char.name,
                                characterIds: [char.id],
                                avatarBase64: char.avatarBase64
                              });
                              if (char.first_mes) {
                                addMessageToChat(newChat.id, { role: 'assistant', content: replaceMacros(char.first_mes, char.name, userName), name: char.name });
                              }
                              setActiveChatId(newChat.id);
                            }}
                            className="flex items-center text-xs text-violet-500 font-medium hover:text-violet-600 p-2 opacity-80 hover:opacity-100 w-full text-left"
                          >
                            <Plus className="w-3 h-3 mr-1" /> Новая ветка
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {generators.length === 0 && characterIds.length === 0 && (
                  <div className="text-center text-slate-800/50 text-sm mt-10">Нет контактов</div>
                )}
              </>
            );
          })() : (
            <>
              {chats.filter(c => c.type === 'group' || c.type === 'plot_generator').map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => { setActiveChatId(chat.id); setIsSidebarOpen(false); }}
                  className={`flex items-center p-3 rounded-xl cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-white/50' : 'hover:bg-white/60'}`}
                >
                  <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0">
                    {chat.type === 'plot_generator' ? <Sparkles className="text-violet-500 w-5 h-5" /> : <Users className="text-violet-500 w-5 h-5" />}
                  </div>
                  <div className="overflow-hidden flex-1">
                    <h3 className="font-medium text-slate-800 text-sm truncate">{chat.name}</h3>
                    <p className="text-xs text-slate-800/70 truncate">{chat.type === 'plot_generator' ? 'Служебный чат' : `${chat.characterIds.length} участников`}</p>
                  </div>
                </div>
              ))}
              {chats.filter(c => c.type === 'group' || c.type === 'plot_generator').length === 0 && (
                <div className="text-center text-slate-800/50 text-sm mt-10">Нет активных сюжетов</div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/40 flex flex-col gap-2 shrink-0 bg-transparent">
          {activeTab === 'contacts' ? (
            <>
              <button 
                onClick={() => setShowContactModal(true)}
                className="flex items-center justify-center w-full py-2.5 bg-white/40 backdrop-blur-xl border border-white/50 border border-indigo-200 text-violet-500 rounded-xl text-sm font-medium hover:bg-white/50 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Создать вручную
              </button>
              <button 
                onClick={() => setShowChubModal(true)}
                className="flex items-center justify-center w-full py-2.5 bg-white/40 backdrop-blur-xl border border-white/50 border border-indigo-200 text-violet-500 rounded-xl text-sm font-medium hover:bg-white/50 transition-colors shadow-sm mt-2"
              >
                <Users className="w-4 h-4 mr-1.5" /> Найти в базе (Chub.ai)
              </button>
              <button 
                onClick={startAIGenerator}
                className="flex items-center justify-center w-full py-2.5 bg-violet-400 text-white rounded-xl text-sm font-medium hover:bg-violet-400 hover:bg-violet-500 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-1.5" /> Создать с ИИ
              </button>
              <button 
                onClick={startAssistantChat}
                className="flex items-center justify-center w-full py-2.5 bg-white/50 text-violet-500 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-white/60 transition-colors shadow-sm mt-2"
              >
                <Bot className="w-4 h-4 mr-1.5" /> Обычный чат (Ассистент)
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setShowStoryModal(true)}
                className="flex items-center justify-center w-full py-2.5 bg-violet-400 text-white rounded-xl text-sm font-medium hover:bg-violet-400 hover:bg-violet-500 transition-colors shadow-sm"
              >
                <BookOpen className="w-4 h-4 mr-1.5" /> Начать сюжет
              </button>
              <button 
                onClick={startAIPlotGenerator}
                className="flex items-center justify-center w-full py-2.5 bg-white/50 text-violet-500 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-white/60 transition-colors shadow-sm mt-2"
              >
                <Sparkles className="w-4 h-4 mr-1.5" /> Сгенерировать с ИИ
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col max-w-full h-full overflow-hidden">
        {/* Header */}
        <header className="bg-white/40 backdrop-blur-xl border border-white/50 shadow-sm p-4 flex items-center shrink-0 z-10 h-[72px]">
          <button className="md:hidden mr-3 text-slate-800/80" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          
          {activeChat ? (
            <>
              <div className="flex -space-x-3 mr-3 flex-shrink-0 cursor-pointer" onClick={() => { openLobbyModal(); }}>
                {/* Character Avatars */}
                {activeChat.type === 'group' ? (
                  activeChat.characterIds?.slice(0, 3).map((id, i) => {
                    const char = characters.find(c => c.id === id);
                    return char ? (
                      <div key={id} className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm" style={{ zIndex: 10 - i }}>
                        {renderAvatar(char.avatarBase64)}
                      </div>
                    ) : null;
                  })
                ) : activeChat.type === 'single' && activeChat.characterIds?.length > 0 ? (
                  <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm" style={{ zIndex: 10 }}>
                    {renderAvatar(characters.find(c => c.id === activeChat.characterIds[0])?.avatarBase64 || activeChat.avatarBase64)}
                  </div>
                ) : activeChat.type === 'generator' ? (
                  <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm" style={{ zIndex: 10 }}>
                    <Bot className="text-violet-500 w-6 h-6" />
                  </div>
                ) : activeChat.type === 'plot_generator' ? (
                  <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm" style={{ zIndex: 10 }}>
                    <Sparkles className="text-violet-500 w-6 h-6" />
                  </div>
                ) : null}

                {/* Local User Avatar */}
                <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm" style={{ zIndex: 5 }}>
                  {renderAvatar(activeChat.userAvatar || userAvatar)}
                </div>

                {/* Network Guests */}
                {activeChat.networkUsers?.slice(0, 2).map((guest, i) => (
                  <div key={guest.id} className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm" style={{ zIndex: 4 - i }}>
                    {renderAvatar(guest.avatar)}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-hidden mr-2">
                <h1 className="font-semibold text-slate-800 text-lg leading-tight truncate">
                  {activeChat.type === 'single' && activeChat.characterIds?.length > 0 
                    ? (characters.find(c => c.id === activeChat.characterIds[0])?.name || activeChat.name) 
                    : activeChat.name}
                </h1>
                <p className="text-xs text-slate-800/70 truncate flex items-center gap-2">
                  <span>{activeChat.type === 'group' ? `${activeChat.characterIds.length} персонажей` : (activeChat.type === 'generator' ? 'Генерация персонажа' : (activeChat.type === 'plot_generator' ? 'Генерация сюжета' : 'Online'))}</span>
                  {balance !== null && <span className="text-green-600 font-medium">${typeof balance === 'number' ? balance.toFixed(2) : balance}</span>}
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 text-slate-800/70 font-medium flex items-center gap-2">
              <span>Выберите чат</span>
              {balance !== null && <span className="text-green-600 font-medium text-sm">${typeof balance === 'number' ? balance.toFixed(2) : balance}</span>}
            </div>
          )}

          <div className="flex items-center gap-1 md:gap-2 relative">
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs bg-white/60 border border-white/50 text-slate-800/90 rounded-lg p-1.5 md:p-2 outline-none focus:ring-2 focus:ring-violet-400 max-w-[80px] min-[400px]:max-w-[100px] sm:max-w-none disabled:opacity-50 truncate"
            >
              {[...AVAILABLE_MODELS].sort((a, b) => {
                const aFav = favoriteModels?.includes(a.id);
                const bFav = favoriteModels?.includes(b.id);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return 0;
              }).map(m => (
                <option key={m.id} value={m.id}>
                  {favoriteModels?.includes(m.id) ? '⭐ ' : ''}{m.name}
                </option>
              ))}
            </select>
            
            {activeChat && (
              <div className="relative">
                <button
                  onClick={() => setShowChatHeaderMenu(!showChatHeaderMenu)}
                  className="p-1.5 md:p-2 text-slate-800/50 hover:text-violet-500 hover:bg-white/50 rounded-lg transition-colors"
                  title="Настройки чата"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                
                {showChatHeaderMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowChatHeaderMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white/95 backdrop-blur-xl border border-white/50 shadow-lg rounded-xl z-50 overflow-hidden py-1">
                      {activeChat.type === 'single' && (
                        <button
                          onClick={() => { setShowChatHeaderMenu(false); handleSummarizeChat(); }}
                          disabled={isSummarizing || activeChat.messages.length === 0}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-600 transition flex items-center disabled:opacity-50"
                        >
                          {isSummarizing ? <Loader2 className="w-4 h-4 mr-3 animate-spin text-violet-500" /> : <GitBranch className="w-4 h-4 mr-3 text-violet-500" />}
                          Саммари главы
                        </button>
                      )}
                      
                      <button
                        onClick={() => { setShowChatHeaderMenu(false); setShowAddCharacterModal(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-600 transition flex items-center"
                      >
                        <UserPlus className="w-4 h-4 mr-3 text-violet-500" />
                        Пригласить персонажа
                      </button>
                      
                      <button
                        onClick={() => { setShowChatHeaderMenu(false); handleInvite('multiplayer'); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-600 transition flex items-center"
                      >
                        <Link2 className="w-4 h-4 mr-3 text-violet-500" />
                        Пригласить друга
                      </button>

                      <button
                        onClick={() => { setShowChatHeaderMenu(false); handleInvite('sync'); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-600 transition flex items-center"
                      >
                        <Link2 className="w-4 h-4 mr-3 text-violet-500" />
                        Синхронизировать устройство
                      </button>

                      <button
                        onClick={() => { setShowChatHeaderMenu(false); toggleFavoriteModel(selectedModel); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-600 transition flex items-center"
                      >
                        <Star className="w-4 h-4 mr-3 text-amber-500" fill={favoriteModels?.includes(selectedModel) ? "currentColor" : "none"} />
                        {favoriteModels?.includes(selectedModel) ? "Убрать звезду" : "В избранное"}
                      </button>

                      <div className="h-px bg-slate-200/50 my-1 mx-2"></div>

                      <button 
                        onClick={() => {
                          setShowChatHeaderMenu(false);
                          if (window.confirm('Вы уверены, что хотите очистить историю сообщений в этом чате?')) {
                            clearChatMessages(activeChat.id);
                          }
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition flex items-center"
                      >
                        <Eraser className="w-4 h-4 mr-3 text-slate-400" />
                        Очистить историю
                      </button>

                      <button 
                        onClick={() => {
                          setShowChatHeaderMenu(false);
                          let msg = 'Вы уверены, что хотите полностью удалить этот чат?';
                          if (activeChat.type === 'single') msg = 'Вы уверены, что хотите удалить этот чат и этого персонажа навсегда?';
                          if (activeChat.type === 'group') msg = 'Вы уверены, что хотите удалить этот сюжет?';
                          
                          if (window.confirm(msg)) {
                            deleteChat(activeChat.id);
                          }
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition flex items-center mt-1"
                      >
                        <Trash2 className="w-4 h-4 mr-3" />
                        Удалить чат
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Chat Messages */}
        <main onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth bg-transparent relative">
          {!activeChat ? (
            <div className="h-full flex items-center justify-center text-slate-800/50">
              <div className="text-center">
                <Sparkles className="w-12 h-12 text-violet-400 mx-auto mb-3" />
                <p>Выберите чат или создайте новый в меню</p>
              </div>
            </div>
          ) : activeChat.messages.length === 0 ? (
            <div className="text-center mt-10">
              <div className="inline-block p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/50 border border-indigo-50 shadow-sm text-sm text-slate-800/70 max-w-sm">
                {activeChat.type === 'generator' ? 
                  "Опишите персонажа, которого хотите создать (например: 'Суровый капитан космического корабля' или 'Милая девушка-бариста с секретом')." :
                  activeChat.type === 'plot_generator' ?
                  "Опишите вашу идею для сюжета. Модель поможет вам расписать сеттинг, конфликт и детали мира." :
                  activeChat.type === 'group' ?
                  `Сюжет: ${activeChat.world_context}` :
                  "Нет сообщений. Начните общение!"
                }
              </div>
            </div>
          ) : (
            activeChat.messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const charNameForMacro = activeChat.type === 'single' ? activeChat.name : null;
              const processedContent = replaceMacros(msg.content, charNameForMacro, activeChat.userName || userName);
              const parsed = isUser ? { text: processedContent } : parseMessageContent(processedContent, activeChat.type);
              
              let speakerChar = null;
              if (parsed.speaker && activeChat.type === 'group') {
                speakerChar = characters.find(c => c.name.toLowerCase() === parsed.speaker.toLowerCase());
              }
              
              let isLocalUser = isUser && (!msg.senderId || msg.senderId === 'user_local' || msg.senderId === clientIdRef.current);
              
              let avatarSrc = null;
              if (!isUser) {
                if (activeChat.type === 'single') avatarSrc = activeChat.avatarBase64;
                else if (speakerChar) avatarSrc = speakerChar.avatarBase64;
              } else {
                if (!isLocalUser) {
                    const guest = activeChat.networkUsers?.find(u => u.id === msg.senderId);
                    avatarSrc = guest ? guest.avatar : null;
                } else {
                    avatarSrc = activeChat.userAvatar || userAvatar;
                }
              }
              
              let displayName = parsed.speaker || (activeChat.type === 'single' ? activeChat.name : (activeChat.type === 'generator' ? 'ИИ' : 'Неизвестный'));
              if (isUser) {
                  if (!isLocalUser) {
                      const guest = activeChat.networkUsers?.find(u => u.id === msg.senderId);
                      displayName = guest ? guest.name : 'Гость';
                  } else {
                      displayName = activeChat.userName || userName || 'Вы';
                  }
              }

              const extractedJSON = (!isUser && activeChat.type === 'generator') ? extractCharacterJSON(msg.content) : null;

              let repliedMsg = null;
              if (msg.replyToId) {
                repliedMsg = activeChat.messages.find(m => m.id === msg.replyToId);
              }

              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
                  <div className={`flex max-w-[95%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 ${editingMessageIndex === idx ? 'w-full' : ''}`}>
                    
                    {/* Desktop Avatar (hidden on mobile) */}
                    <div 
                      className="hidden md:flex w-8 h-8 rounded-full bg-white/60 flex-shrink-0 items-center justify-center overflow-hidden mb-1 border border-indigo-50 shadow-sm cursor-pointer hover:opacity-80 transition"
                      onClick={() => { if (avatarSrc) setFullscreenImage(avatarSrc); }}
                    >
                      {(!isUser && activeChat.type === 'generator') ? <Bot className="w-5 h-5 text-indigo-400" /> : renderAvatar(avatarSrc)}
                    </div>
                    
                    <div className={`flex flex-col group min-w-0 ${editingMessageIndex === idx ? 'flex-1' : ''}`}>
                      
                      {/* Mobile Header: Mini-avatar + Name */}
                      <div className={`flex md:hidden items-center gap-2 mb-1.5 ${isUser ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
                        <div 
                          className="w-5 h-5 rounded-full bg-white/60 flex-shrink-0 flex items-center justify-center overflow-hidden border border-indigo-50 shadow-sm cursor-pointer hover:opacity-80 transition"
                          onClick={() => { if (avatarSrc) setFullscreenImage(avatarSrc); }}
                        >
                          {(!isUser && activeChat.type === 'generator') ? <Bot className="w-3.5 h-3.5 text-indigo-400" /> : renderAvatar(avatarSrc)}
                        </div>
                        <span className="text-xs text-slate-800/70 font-medium">{displayName}</span>
                      </div>

                      {/* Desktop Name for Group chats */}
                      {(activeChat.type === 'group' || isUser) && (
                        <span className={`hidden md:inline-block text-xs text-slate-800/70 mb-1 font-medium ${isUser ? 'mr-1 text-right' : 'ml-1'}`}>{displayName}</span>
                      )}
                      <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${editingMessageIndex === idx ? 'w-full' : ''}`}>
                        <div 
                          className={`rounded-2xl p-4 ${editingMessageIndex === idx ? 'w-full' : ''} ${
                            isUser 
                              ? 'bg-violet-400 hover:bg-violet-500 text-slate-800 rounded-br-sm shadow-md' 
                              : 'bg-white/40 backdrop-blur-xl border border-white/50 text-slate-800 shadow-sm rounded-bl-sm border border-white/40'
                          }`}
                        >
                          <div className={`prose prose-sm max-w-none break-words ${isUser ? 'text-indigo-50 prose-headings:text-slate-800 prose-a:text-violet-400 prose-strong:text-slate-800' : 'text-slate-800'}`}>
                            {editingMessageIndex === idx ? (
                              <div className="flex flex-col gap-2 w-full">
                                <TextareaAutosize 
                                  minRows={1}
                                  value={editingMessageContent}
                                  onChange={(e) => setEditingMessageContent(e.target.value)}
                                  className={`w-full ${isUser ? 'bg-white/20 border-white/30 text-slate-800' : 'bg-white/50 border-white/60 text-slate-800'} border rounded-xl p-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none`}
                                />
                                <div className="flex justify-end gap-2 mt-1">
                                  <button 
                                    onClick={() => setEditingMessageIndex(null)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium ${isUser ? 'bg-white/20 hover:bg-white/30 text-slate-800' : 'bg-white/50 hover:bg-white/70 text-slate-800'}`}
                                  >
                                    Отмена
                                  </button>
                                  <button 
                                    onClick={() => {
                                      editMessageInChat(activeChat.id, idx, editingMessageContent);
                                      setEditingMessageIndex(null);
                                    }}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" /> Сохранить
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {repliedMsg && (
                                  <div className={`text-xs p-2 mb-2 rounded border-l-2 ${isUser ? 'bg-white/20 border-white/40 text-indigo-100' : 'bg-slate-100 border-indigo-400 text-slate-500'}`}>
                                    <div className="font-semibold mb-1 truncate">{repliedMsg.role === 'user' ? 'Вы' : (repliedMsg.name || 'Персонаж')}</div>
                                    <div className="line-clamp-2">{repliedMsg.content}</div>
                                  </div>
                                )}
                                <ReactMarkdown>{parsed.text}</ReactMarkdown>
                              </>
                            )}
                          </div>
                          
                          {extractedJSON && (
                            <div className="mt-4 p-4 bg-white/50 rounded-xl border border-indigo-100">
                              <h4 className="font-bold text-fuchsia-900 mb-2 flex items-center gap-2">
                                {extractedJSON.avatar_emoji} {extractedJSON.name}
                              </h4>
                              <p className="text-xs text-fuchsia-700 mb-4 line-clamp-3">{extractedJSON.system_prompt}</p>
                              <button 
                                onClick={() => saveExtractedCharacter(extractedJSON)}
                                className="w-full flex justify-center items-center gap-2 py-2 bg-violet-400 hover:bg-violet-500 text-slate-800 text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
                              >
                                <Plus className="w-4 h-4" /> Добавить в контакты
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <button 
                            onClick={() => setReplyToId(msg.id)} 
                            className="p-1.5 text-slate-800/40 hover:text-indigo-500 transition-all"
                            title="Ответить"
                          >
                            <Reply className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setEditingMessageIndex(idx);
                              setEditingMessageContent(msg.content);
                            }} 
                            className="p-1.5 text-slate-800/40 hover:text-indigo-500 transition-all"
                            title="Редактировать сообщение"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteMessageFromChat(activeChat.id, idx)} 
                            className="p-1.5 text-slate-800/40 hover:text-red-500 transition-all"
                            title="Удалить сообщение"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          
          {isTyping && activeChat && (
            <div className="flex justify-start">
              <div className="flex items-end gap-2">
                 <div className="w-8 h-8 rounded-full bg-white/60 flex-shrink-0 flex items-center justify-center mb-1">
                   <span className="animate-pulse w-2 h-2 bg-indigo-400 rounded-full"></span>
                 </div>
                 <div className="bg-white/40 backdrop-blur-xl border border-white/50 text-slate-800/70 shadow-sm rounded-2xl rounded-bl-sm p-3 border border-white/40 text-sm flex items-center space-x-1">
                   <span className="animate-bounce">.</span>
                   <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                   <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
                 </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </main>
        
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-24 right-4 md:right-8 p-3 bg-violet-400 text-white rounded-full shadow-lg hover:bg-violet-500 transition-all z-20"
            title="Вниз"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}

        {/* Input Area */}
        <footer className="bg-white/40 backdrop-blur-xl border border-white/50 p-3 md:p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] shrink-0 z-10 flex flex-col gap-2">
          
          {/* Target Lock (Панель фокуса) */}
          {activeChat && (activeChat.type === 'single' || activeChat.type === 'group') && activeChat.characterIds?.length > 0 && (
            <div className="max-w-4xl mx-auto w-full flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <span className="text-xs font-semibold text-slate-800/60 uppercase tracking-wider shrink-0">Кому:</span>
              <button 
                onClick={() => setMentions([])}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0 ${mentions.length === 0 ? 'bg-violet-400 text-white border-violet-400' : 'bg-white/60 text-slate-800/70 border-white/50 hover:bg-white/80'}`}
              >
                Всем
              </button>
              {activeChat.characterIds.map(charId => {
                const char = characters.find(c => c.id === charId);
                if (!char) return null;
                return (
                  <button 
                    key={charId}
                    onClick={() => {
                      const isSelected = mentions.includes(charId);
                      if (isSelected) setMentions(mentions.filter(m => m !== charId));
                      else setMentions([...mentions, charId]);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0 ${mentions.includes(charId) ? 'bg-violet-400 text-white border-violet-400' : 'bg-white/60 text-slate-800/70 border-white/50 hover:bg-white/80'}`}
                  >
                    {char.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Reply Preview */}
          {replyToId && (
            <div className="max-w-4xl mx-auto w-full bg-white/60 rounded-xl p-2 border border-white/50 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-violet-500 mb-0.5">Ответ:</div>
                <div className="text-xs text-slate-800/70 truncate">
                  {activeChat?.messages.find(m => m.id === replyToId)?.content || "Сообщение..."}
                </div>
              </div>
              <button 
                onClick={() => setReplyToId(null)}
                className="p-1 text-slate-800/40 hover:text-slate-800 bg-white/50 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="max-w-4xl mx-auto w-full flex items-end bg-white/60 rounded-2xl border border-white/50 p-1 focus-within:ring-2 focus-within:ring-violet-400 focus-within:border-transparent transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!activeChat || isTyping}
              placeholder={activeChat ? "Написать сообщение..." : "Выберите чат..."}
              className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] p-3 text-sm outline-none disabled:opacity-50"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping || !activeChat}
              className="p-3 text-violet-500 disabled:text-gray-300 transition-colors hover:text-violet-500"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </footer>
      </div>

      {/* Modal: Add Character to Chat */}
      {showAddCharacterModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-2xl max-w-sm w-full p-6 shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Пригласить персонажа</h3>
              <button onClick={() => setShowAddCharacterModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[50vh] space-y-2 pr-1">
              {characters.filter(c => !activeChat?.characterIds?.includes(c.id)).map(char => (
                <div 
                  key={char.id}
                  onClick={() => {
                    addCharacterToChat(activeChat.id, char.id);
                    addMessageToChat(activeChat.id, { 
                      role: 'assistant', 
                      content: `[Система]: Персонаж ${char.name} присоединился к беседе.`,
                      name: 'Система'
                    });
                    setShowAddCharacterModal(false);
                  }}
                  className="flex items-center p-3 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0">
                    {renderAvatar(char.avatarBase64)}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-medium text-slate-800 text-sm truncate">{char.name}</h4>
                  </div>
                </div>
              ))}
              
              {characters.filter(c => !activeChat?.characterIds?.includes(c.id)).length === 0 && (
                <div className="text-center text-slate-500 text-sm py-4">Нет доступных контактов для добавления</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Contact */}
      {showLobbyModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Настройки комнаты / Лобби</h3>
              <button onClick={() => setShowLobbyModal(false)} className="text-slate-800/60 hover:text-slate-800">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {/* My Role */}
                <div className="bg-white/30 backdrop-blur-sm rounded-xl p-4 border border-white/50 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-3">Ваша роль в этом чате</h4>
                    <div className="flex gap-4">
                        <div className="flex flex-col items-center">
                            <label className="w-16 h-16 rounded-full bg-white/60 border border-indigo-100 flex items-center justify-center cursor-pointer overflow-hidden shadow-sm hover:opacity-80 transition shrink-0">
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setLobbyUserAvatar)} />
                                {lobbyUserAvatar ? <img src={lobbyUserAvatar} className="w-full h-full object-cover" /> : <User className="text-indigo-400 w-8 h-8" />}
                            </label>
                            <span className="text-[10px] text-slate-800/60 mt-1">Изменить</span>
                        </div>
                        <div className="flex-1 space-y-3">
                            <input 
                                type="text"
                                value={lobbyUserName}
                                onChange={e => setLobbyUserName(e.target.value)}
                                placeholder="Ваше имя"
                                className="w-full border border-white/60 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 bg-white/50 text-slate-800 font-medium"
                            />
                            <TextareaAutosize 
                                minRows={2}
                                value={lobbyUserDescription}
                                onChange={e => setLobbyUserDescription(e.target.value)}
                                placeholder="О себе (внешность, роль)"
                                className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 bg-white/50 text-slate-800"
                            />
                        </div>
                    </div>
                </div>

                {/* AI Characters */}
                {(activeChat?.type === 'group' || activeChat?.type === 'single') && activeChat.characterIds && activeChat.characterIds.length > 0 && (
                    <div className="bg-white/30 backdrop-blur-sm rounded-xl p-4 border border-white/50 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-slate-800">Участники-ИИ</h4>
                            {activeChat?.type === 'group' && (
                                <button onClick={() => { setShowLobbyModal(false); setShowAddCharacterModal(true); }} className="text-xs flex items-center gap-1 text-violet-600 hover:text-violet-700 font-medium">
                                    <Plus className="w-3 h-3" /> Добавить
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {activeChat.characterIds.map(id => {
                                const char = characters.find(c => c.id === id);
                                if (!char) return null;
                                return (
                                    <div key={id} onClick={() => { setShowLobbyModal(false); openEditContact(char); }} className="flex items-center gap-2 bg-white/50 rounded-lg px-2 py-1.5 border border-white/60 cursor-pointer hover:bg-white/80 transition shadow-sm">
                                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                                            {renderAvatar(char.avatarBase64)}
                                        </div>
                                        <span className="text-xs font-medium text-slate-800 truncate max-w-[100px]">{char.name}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Network Guests */}
                {activeChat?.networkUsers && activeChat.networkUsers.filter(u => u.id !== clientIdRef.current).length > 0 && (
                    <div className="bg-white/30 backdrop-blur-sm rounded-xl p-4 border border-white/50 shadow-sm">
                        <h4 className="text-sm font-bold text-slate-800 mb-3">Гости по ссылке</h4>
                        <div className="flex flex-col gap-2">
                            {activeChat.networkUsers.filter(u => u.id !== clientIdRef.current).map(guest => (
                                <div key={guest.id} className="flex items-center gap-3 bg-white/50 rounded-lg p-2 border border-white/60 shadow-sm">
                                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-white/60">
                                        {renderAvatar(guest.avatar)}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <div className="text-sm font-medium text-slate-800 truncate">{guest.name}</div>
                                        <div className="text-xs text-slate-800/60 truncate">{guest.description || 'Нет описания'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6 flex flex-col gap-2 shrink-0">
                <button 
                    onClick={saveLobbyProfile} 
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                    <Check className="w-5 h-5" />
                    Сохранить / Войти
                </button>
                <button 
                    onClick={() => { setShowLobbyModal(false); handleInvite('multiplayer'); }} 
                    className="w-full bg-violet-100 hover:bg-violet-200 text-violet-700 font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                    <Link2 className="w-5 h-5" />
                    Сгенерировать сетевую ссылку
                </button>
            </div>
          </div>
        </div>
      )}

      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">{editingCharId ? "Редактирование" : "Новый персонаж"}</h3>
              <div className="flex gap-2">
                <label className="cursor-pointer text-xs bg-indigo-100 text-indigo-700 py-1.5 px-3 rounded-lg hover:bg-indigo-200 transition font-medium">
                  Импорт (PNG/JSON)
                  <input type="file" accept=".png,.json" className="hidden" onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                      let data;
                      if (file.name.endsWith('.png')) {
                        data = await parseTavernCard(file);
                      } else {
                        const text = await file.text();
                        data = JSON.parse(text);
                      }
                      const charData = data.data || data; // handle both v2 and standard formats
                      setNewContactName(charData.name || '');
                      setNewContactPrompt(charData.system_prompt || charData.systemPrompt || '');
                      setNewContactDescription(charData.description || '');
                      setNewContactPersonality(charData.personality || '');
                      setNewContactScenario(charData.scenario || '');
                      setNewContactFirstMes(charData.first_mes || '');
                      setNewContactMesExample(charData.mes_example || '');
                      alert('Успешно загружено!');
                    } catch (err) {
                      alert('Ошибка при импорте: ' + err.message);
                    }
                  }} />
                </label>
              </div>
            </div>

            <div className="flex border-b border-white/40 mb-4 shrink-0">
              {['main', 'details', 'examples'].map(tab => (
                <button 
                  key={tab}
                  className={`flex-1 py-2 text-sm font-medium ${contactModalTab === tab ? 'text-violet-500 border-b-2 border-indigo-600' : 'text-slate-800/70 hover:text-slate-800/90'}`}
                  onClick={() => setContactModalTab(tab)}
                >
                  {tab === 'main' ? 'Главное' : tab === 'details' ? 'Детали' : 'Диалоги'}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {contactModalTab === 'main' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-2">Аватар</label>
                    <div className="flex items-center gap-3">
                      <div 
                        className={`w-16 h-16 rounded-full bg-transparent border border-white/50 overflow-hidden flex items-center justify-center shrink-0 ${newContactAvatar ? 'cursor-pointer hover:opacity-80 transition' : ''}`}
                        onClick={() => { if (newContactAvatar) setFullscreenImage(newContactAvatar); }}
                      >
                        {newContactAvatar ? <img src={newContactAvatar} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-800/50 w-6 h-6" />}
                      </div>
                      <label className="cursor-pointer bg-white/40 backdrop-blur-xl border border-white/50 text-slate-800/90 py-2 px-4 rounded-xl text-sm font-medium hover:bg-white/60 transition w-full text-center">
                        Загрузить фото
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setNewContactAvatar)} />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Имя</label>
                    <input 
                      type="text" 
                      value={newContactName}
                      onChange={e => setNewContactName(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
                  
                  <CollapsibleField
                    label="Системный промпт (Инструкции)"
                    value={newContactPrompt}
                    onChange={setNewContactPrompt}
                  />

                  <CollapsibleField
                    label="Первое сообщение"
                    value={newContactFirstMes}
                    onChange={setNewContactFirstMes}
                  />
                </>
              )}

              {contactModalTab === 'details' && (
                <>
                  <CollapsibleField
                    label="Описание (Внешность, Бэкграунд)"
                    value={newContactDescription}
                    onChange={setNewContactDescription}
                  />
                  <CollapsibleField
                    label="Характер"
                    value={newContactPersonality}
                    onChange={setNewContactPersonality}
                  />
                </>
              )}

              {contactModalTab === 'examples' && (
                <>
                  <CollapsibleField
                    label="Сценарий / Мир"
                    value={newContactScenario}
                    onChange={setNewContactScenario}
                  />
                  <CollapsibleField
                    label="Примеры диалогов (mes_example)"
                    value={newContactMesExample}
                    onChange={setNewContactMesExample}
                  />
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/40 shrink-0">
              <button onClick={translateCard} disabled={isTranslatingCard || !apiKey} className="px-4 py-2.5 mr-auto text-white bg-blue-500 hover:bg-blue-600 rounded-xl text-sm font-medium disabled:opacity-50 transition flex items-center justify-center flex-1 sm:flex-none">
                {isTranslatingCard ? 'Перевод...' : 'Перевести'}
              </button>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                {editingCharId && (
                  <button 
                    onClick={() => {
                      if (window.confirm('Вы уверены, что хотите удалить этого персонажа и ВСЕ его главы?')) {
                        deleteCharacter(editingCharId);
                        setShowContactModal(false);
                      }
                    }} 
                    className="px-5 py-2.5 text-red-500 bg-transparent rounded-xl text-sm font-medium hover:bg-red-50 transition"
                  >
                    Удалить
                  </button>
                )}
                <button onClick={() => setShowContactModal(false)} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Отмена</button>
                <button onClick={createContact} disabled={!newContactName} className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium disabled:opacity-50 transition">
                  {editingCharId ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Modal: Chub Search */}
      {showChubModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Поиск в базе Chub.ai</h3>
              <button onClick={() => setShowChubModal(false)} className="text-slate-800/50 hover:text-slate-800"><X className="w-5 h-5"/></button>
            </div>
            
            <form onSubmit={searchChub} className="flex flex-col gap-3 mb-4">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={chubQuery}
                  onChange={e => setChubQuery(e.target.value)}
                  placeholder="Поиск персонажей (на английском)..."
                  className="flex-1 border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 bg-white/50"
                />
                <button type="submit" disabled={isChubLoading} className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                  {isChubLoading ? 'Поиск...' : 'Найти'}
                </button>
              </div>
              <div className="flex flex-wrap gap-4 px-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800/80 hover:text-slate-800 transition">
                  <input 
                    type="checkbox" 
                    checked={chubIncludeNsfw}
                    onChange={e => setChubIncludeNsfw(e.target.checked)}
                    className="rounded border-white/50 text-violet-500 focus:ring-violet-400 bg-white/50 cursor-pointer w-4 h-4"
                  />
                  Искать NSFW (18+)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800/80 hover:text-slate-800 transition">
                  <input 
                    type="checkbox" 
                    checked={chubIncludeVenus}
                    onChange={e => setChubIncludeVenus(e.target.checked)}
                    className="rounded border-white/50 text-violet-500 focus:ring-violet-400 bg-white/50 cursor-pointer w-4 h-4"
                  />
                  База Venus (откровенный контент)
                </label>
              </div>
            </form>

            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {chubResults.map(char => (
                <div key={char.id} className="bg-white/40 backdrop-blur-xl border border-white/50 p-3 rounded-xl flex items-start gap-3 hover:bg-white/50 transition">
                  <div className="w-16 h-16 rounded-lg bg-indigo-50 shrink-0 overflow-hidden">
                    {char.avatar_url ? <img src={char.avatar_url.startsWith("http") ? char.avatar_url : `https://avatars.charhub.io/avatars/${char.avatar_url}`} className="w-full h-full object-cover" /> : <img src={`https://avatars.charhub.io/avatars/${char.fullPath}/avatar.webp`} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-bold text-slate-800 text-sm truncate">{char.name}</h4>
                    <p className="text-xs text-slate-800/70 line-clamp-2 mt-1">{char.translatedTagline || char.tagline || char.description}</p>
                    <button onClick={() => importFromChub(char.fullPath)} className="mt-2 text-xs font-medium bg-violet-400 text-white px-3 py-1.5 rounded-lg hover:bg-violet-500 transition w-full">
                      Добавить в чат
                    </button>
                  </div>
                </div>
              ))}
              {chubResults.length === 0 && !isChubLoading && chubQuery && (
                <div className="col-span-full text-center text-slate-800/50 py-10">Ничего не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Story */}
      {showStoryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-md w-full p-6 shadow-xl max-h-[90vh] flex flex-col">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Создать ролевую игру</h3>
            
            <div className="flex-1 overflow-y-auto pr-1">
              {!selectedScenario ? (
                isCreatingCustomScenario ? (
                  <div className="space-y-4">
                    <button 
                      onClick={() => setIsCreatingCustomScenario(false)}
                      className="text-sm text-violet-500 hover:underline mb-2"
                    >
                      ← Назад к выбору сюжета
                    </button>
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-800/90 mb-1">Название сюжета</label>
                      <input 
                        type="text" 
                        value={customScenarioData.title}
                        onChange={e => setCustomScenarioData(prev => ({...prev, title: e.target.value}))}
                        className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400"
                        placeholder="Например: Ограбление банка"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-800/90 mb-1">Сеттинг / Контекст</label>
                      <textarea 
                        value={customScenarioData.world_context}
                        onChange={e => setCustomScenarioData(prev => ({...prev, world_context: e.target.value}))}
                        className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-none h-28"
                        placeholder="Детальное описание мира, текущей ситуации и правил поведения персонажей..."
                      />
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-800/90 mb-1">Количество участников (персонажей)</label>
                      <select
                        value={customScenarioData.required_characters_count}
                        onChange={e => setCustomScenarioData(prev => ({...prev, required_characters_count: parseInt(e.target.value)}))}
                        className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 bg-white/40 backdrop-blur-xl border border-white/50"
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>

                    <div className="flex justify-end">
                      <button 
                        onClick={() => {
                          setSelectedScenario({
                            id: 'custom_' + Date.now(),
                            title: customScenarioData.title,
                            description: 'Свой сюжет',
                            world_context: customScenarioData.world_context,
                            required_characters_count: customScenarioData.required_characters_count
                          });
                          setIsCreatingCustomScenario(false);
                        }} 
                        disabled={!customScenarioData.title || !customScenarioData.world_context} 
                        className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition w-full"
                      >
                        Далее (Выбор персонажей)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div 
                      onClick={() => setIsCreatingCustomScenario(true)}
                      className="border border-indigo-200 bg-white/50/30 rounded-xl p-4 cursor-pointer hover:border-fuchsia-400 hover:bg-white/50 transition flex items-center justify-between"
                    >
                      <div>
                        <h4 className="font-bold text-fuchsia-800 mb-1">📝 Создать свой сюжет</h4>
                        <p className="text-xs text-violet-500/80">Напишите собственную историю и выберите количество персонажей</p>
                      </div>
                      <Plus className="text-violet-500 w-5 h-5" />
                    </div>

                    <p className="text-sm text-slate-800/70 mt-4 mb-2">Или выберите готовый сюжет:</p>
                    {scenarios.map(s => (
                      <div 
                        key={s.id} 
                        onClick={() => setSelectedScenario(s)}
                        className="border border-white/50 rounded-xl p-4 cursor-pointer hover:border-fuchsia-400 hover:bg-white/50/50 transition"
                      >
                        <h4 className="font-bold text-slate-800 mb-1">{s.title}</h4>
                        <p className="text-xs text-slate-800/70 mb-2">{s.description}</p>
                        <div className="flex items-center text-xs text-violet-500 font-medium">
                          <Users className="w-3.5 h-3.5 mr-1" /> Требуется персонажей: {s.required_characters_count}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <button 
                    onClick={() => { setSelectedScenario(null); setStorySlots({}); }}
                    className="text-sm text-violet-500 hover:underline mb-2"
                  >
                    ← Назад к выбору сюжета
                  </button>
                  
                  <div className="bg-white/50 p-4 rounded-xl border border-indigo-100 mb-4">
                    <h4 className="font-bold text-fuchsia-900 mb-1">{selectedScenario.title}</h4>
                    <p className="text-xs text-fuchsia-700">{selectedScenario.world_context}</p>
                  </div>

                  <p className="text-sm font-medium text-slate-800/90">Назначьте персонажей на слоты:</p>
                  {Array.from({ length: selectedScenario.required_characters_count }).map((_, i) => (
                    <div key={i} className="mb-3">
                      <label className="block text-xs text-slate-800/70 mb-1">Слот {i + 1}</label>
                      <select 
                        value={storySlots[i] || ''}
                        onChange={e => setStorySlots(prev => ({...prev, [i]: e.target.value}))}
                        className="w-full border border-white/60 rounded-xl p-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 bg-white/40 backdrop-blur-xl border border-white/50"
                      >
                        <option value="" disabled>-- Выберите контакт --</option>
                        <option value="USER" disabled={Object.values(storySlots).includes('USER') && storySlots[i] !== 'USER'}>
                          👤 Я (Пользователь)
                        </option>
                        {characters.map(c => (
                          <option key={c.id} value={c.id} disabled={Object.values(storySlots).includes(c.id) && storySlots[i] !== c.id}>
                            🤖 {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {(characters.length + 1) < selectedScenario.required_characters_count && (
                    <p className="text-xs text-red-500 mt-2">Не хватает созданных контактов для этого сюжета.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end mt-6 shrink-0 pt-4 border-t border-white/40">
              <button onClick={() => {setShowStoryModal(false); setSelectedScenario(null); setStorySlots({});}} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Отмена</button>
              {selectedScenario && (
                <button 
                  onClick={createStory} 
                  disabled={Object.keys(storySlots).length < selectedScenario.required_characters_count} 
                  className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  Начать
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Настройки</h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-800/90 mb-2">Ваше имя (для {'{{user}}'})</label>
              <input 
                type="text" 
                value={tempUserName}
                onChange={e => setTempUserName(e.target.value)}
                className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 mb-4"
                placeholder="Михо"
              />
              <label className="block text-sm font-medium text-slate-800/90 mb-2">OpenRouter API Key</label>
              <input 
                type="password" 
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
                className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400"
                placeholder="sk-or-v1-..."
              />
              <p className="text-xs text-slate-800/70 mt-2">Ваш ключ надежно сохраняется только в вашем браузере (локально) и никуда не передается, кроме API OpenRouter.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSettingsModal(false)} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Закрыть</button>
              <button 
                onClick={() => { setApiKey(tempApiKey); setUserName(tempUserName); setShowSettingsModal(false); }} 
                className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Summary Memory */}
      {summaryModalChatId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-lg w-full p-6 shadow-xl flex flex-col max-h-[80vh]">
            <h3 className="text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-500" />
              Настройки чата (главы)
            </h3>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-800/90 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" /> Ваше имя в этом чате (для {'{{user}}'})
                </label>
                <input 
                  type="text" 
                  value={tempChatUserName}
                  onChange={e => setTempChatUserName(e.target.value)}
                  className="w-full bg-white/50 border border-white/60 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
                  placeholder={userName || "Имя по умолчанию"}
                />
                <p className="text-xs text-slate-800/70 mt-2">
                  Если оставить пустым, будет использовано глобальное имя ({userName || "Пользователь"}).
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800/90 mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-500" /> Память (Саммари)
                </label>
                <p className="text-xs text-slate-800/70 mb-2">
                  Краткий пересказ прошлых событий для нейросети.
                </p>
                <TextareaAutosize
                  minRows={5}
                  className="w-full resize-none bg-white/50 border border-white/60 rounded-xl p-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
                  value={summaryModalText}
                  onChange={e => setSummaryModalText(e.target.value)}
                  placeholder="Саммари пусто. Вы можете нажать 'Саммари' в прошлой главе, чтобы сгенерировать его автоматически, или написать здесь текст вручную."
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-white/40">
              <button 
                onClick={() => {
                  setSummaryModalChatId(null);
                  setSummaryModalText("");
                  setTempChatUserName("");
                }} 
                className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition"
              >
                Отмена
              </button>
              <button 
                onClick={() => {
                  updateChatSummary(summaryModalChatId, summaryModalText);
                  updateChatField(summaryModalChatId, 'userName', tempChatUserName);
                  setSummaryModalChatId(null);
                  setSummaryModalText("");
                  setTempChatUserName("");
                }} 
                className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Viewer */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <img 
            src={fullscreenImage} 
            alt="Fullscreen" 
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button 
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 text-white/50 hover:text-white bg-black/50 hover:bg-black/80 rounded-full p-2 transition"
          >
            <X className="w-8 h-8" />
          </button>
        </div>
      )}

      {/* Invite Link Modal */}
      {inviteLink && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-white/50 flex justify-between items-center bg-white/40">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-violet-500" />
                Пригласить в комнату
              </h2>
              <button onClick={() => setInviteLink('')} className="p-2 text-slate-800/60 hover:text-slate-800 hover:bg-white/50 rounded-xl transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-800/80 mb-4">
                Эта ссылка содержит ключ шифрования и карточки персонажей (без старой истории сообщений). Отправьте ее собеседнику.
              </p>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text" 
                  value={inviteLink} 
                  readOnly 
                  className="flex-1 border border-white/60 rounded-xl p-3 text-sm outline-none bg-white/50 text-slate-800"
                />
                <button 
                  onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      const original = inviteLink;
                      setInviteLink('Скопировано!');
                      setTimeout(() => setInviteLink(original), 2000);
                  }}
                  className="px-4 bg-violet-400 hover:bg-violet-500 text-white rounded-xl transition flex items-center justify-center shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
