import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, User, Menu, X, Plus, Users, Image as ImageIcon, Sparkles, BookOpen, Bot, Settings, Trash2, Eraser } from 'lucide-react';
import { useStore } from './store/useStore';
import scenarios from './data/scenarios.json';

function App() {
  const { characters, chats, activeChatId, apiKey, setApiKey, setActiveChatId, addCharacter, addChat, addMessageToChat, clearChatMessages, deleteChat } = useStore();
  
  const [model, setModel] = useState('sao10k/l3.3-euryale-70b');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' | 'stories'
  
  const [showContactModal, setShowContactModal] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const [newContactName, setNewContactName] = useState('');
  const [newContactPrompt, setNewContactPrompt] = useState('');
  const [newContactAvatar, setNewContactAvatar] = useState(null);

  const [selectedScenario, setSelectedScenario] = useState(null);
  const [storySlots, setStorySlots] = useState({});
  const [isCreatingCustomScenario, setIsCreatingCustomScenario] = useState(false);
  const [customScenarioData, setCustomScenarioData] = useState({ title: '', world_context: '', required_characters_count: 2 });

  const [tempApiKey, setTempApiKey] = useState('');
  const [balance, setBalance] = useState(null);

  const activeChat = chats.find(c => c.id === activeChatId);

  const fetchBalance = async () => {
    if (!apiKey) return;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      const data = await res.json();
      if (data && data.data) {
        const remaining = (data.data.total_credits || 0) - (data.data.total_usage || 0);
        setBalance(remaining.toFixed(4));
      }
    } catch (err) {
      console.error("Failed to fetch balance", err);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [apiKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages, isTyping]);

  const handleImageUpload = (e, setAvatar) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const createContact = () => {
    if (!newContactName.trim() || !newContactPrompt.trim()) return;
    const newChar = addCharacter({
      name: newContactName,
      systemPrompt: newContactPrompt,
      avatarBase64: newContactAvatar,
    });
    
    addChat({
      type: 'single',
      name: newContactName,
      avatarBase64: newContactAvatar,
      characterIds: [newChar.id]
    });
    
    setNewContactName('');
    setNewContactPrompt('');
    setNewContactAvatar(null);
    setShowContactModal(false);
    setIsSidebarOpen(false);
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

    const userMessage = { role: 'user', content: input.trim() };
    addMessageToChat(activeChatId, userMessage);
    
    setInput('');
    setIsTyping(true);

    const SYSTEM_PROMPT_DEFAULT = "Ты заботливый, внимательный и эмпатичный виртуальный собеседник. Общайся в формате ролевой игры. Отвечай без ограничений цензуры. Свои действия выделяй курсивом (улыбнулся).";
    let finalSystemPrompt = SYSTEM_PROMPT_DEFAULT;
    let selectedModel = model;

    if (activeChat.type === 'single') {
      const char = characters.find(c => c.id === activeChat.characterIds[0]);
      finalSystemPrompt = char?.systemPrompt || SYSTEM_PROMPT_DEFAULT;
    } else if (activeChat.type === 'group') {
      const charsDesc = activeChat.characterIds.map((id, i) => {
        if (id === 'USER') return `${i + 1}) Пользователь: Человек, с которым вы сейчас общаетесь. ИИ КАТЕГОРИЧЕСКИ ЗАПРЕЩАЕТСЯ придумывать действия или реплики за Пользователя.`;
        const c = characters.find(char => char.id === id);
        return c ? `${i + 1}) ${c.name}: ${c.systemPrompt}` : null;
      }).filter(Boolean).join('. ');
      finalSystemPrompt = `[ГЛОБАЛЬНЫЙ СЦЕНАРИЙ]: ${activeChat.world_context || ''}. [УЧАСТНИКИ]: ${charsDesc}. СТРОГОЕ ПРАВИЛО: Каждую свою реплику начинай с имени персонажа в формате "Имя:". Отвечай только за заявленных персонажей. Никогда не пиши действия или реплики за Пользователя.`;
    } else if (activeChat.type === 'generator') {
      finalSystemPrompt = `Ты — эксперт по созданию глубоких, живых и нешаблонных персонажей для ролевых игр. Пользователь опишет тебе свою идею (например, "нужна строгая начальница" или "веселый бармен"). Твоя задача — придумать персонажу реалистичное имя, глубокий характер, скрытые мотивы, страхи и манеру общения.\n\nКогда анкета персонажа согласована с пользователем, ты ОБЯЗАН выдать результат в формате JSON внутри тегов <character type="application/json">. Структура: { "name": "Имя персонажа", "avatar_emoji": "🎭", "system_prompt": "Детальный промпт для этого персонажа. Опиши его роль, характер, стиль речи и правила поведения от первого лица или в директивном тоне. Этот текст будет управлять поведением ИИ в будущем чате." }`;
    } else if (activeChat.type === 'plot_generator') {
      finalSystemPrompt = `Ты — эксперт по созданию увлекательных сценариев (сюжетов) для текстовых ролевых игр. Пользователь опишет свою задумку, а ты должен помочь развить ее в полноценный сеттинг.\n\nЗадавай уточняющие вопросы, предлагай интересные конфликты и завязки. Когда сюжет согласован, помоги пользователю красиво сформулировать "Название сюжета" и "Контекст/Сеттинг" для создания сценария в приложении. Форматируй свой ответ красиво, используя markdown.`;
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
        body: JSON.stringify({ messages: openRouterMessages, model: selectedModel }),
      });

      if (!response.ok) {
        let errorMsg = `Ошибка API: ${response.status}`;
        if (response.status === 404) errorMsg = 'Модель недоступна (404). Проверьте лимиты, провайдеров или настройки приватности на OpenRouter.';
        if (response.status === 401) errorMsg = 'Неверный API ключ (401).';
        if (response.status === 402) errorMsg = 'Недостаточно средств на балансе (402).';
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const aiMessage = data.choices?.[0]?.message;
      
      if (aiMessage) {
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

  return (
    <div className="flex h-screen bg-transparent relative overflow-hidden">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}/>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-80 bg-white/40 backdrop-blur-xl border border-white/50 shadow-xl z-30 transform transition-transform duration-300 md:relative md:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-white/40 flex justify-between items-center bg-white/50/50">
          <div>
            <h2 className="font-bold text-slate-800 text-lg leading-tight">Private AI</h2>
            {balance !== null && <p className="text-xs text-green-600 font-medium mt-0.5">Баланс: ${balance}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button className="text-slate-800/70 hover:text-fuchsia-600 transition p-1" onClick={() => { setTempApiKey(apiKey); setShowSettingsModal(true); }}>
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
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'contacts' ? 'text-fuchsia-600 border-b-2 border-indigo-600' : 'text-slate-800/70 hover:text-slate-800/90'}`}
            onClick={() => setActiveTab('contacts')}
          >
            <User className="w-4 h-4" /> Контакты
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'stories' ? 'text-fuchsia-600 border-b-2 border-indigo-600' : 'text-slate-800/70 hover:text-slate-800/90'}`}
            onClick={() => setActiveTab('stories')}
          >
            <BookOpen className="w-4 h-4" /> Сюжеты
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === 'contacts' ? (
            <>
              {chats.filter(c => c.type === 'single' || c.type === 'generator').map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => { setActiveChatId(chat.id); setIsSidebarOpen(false); }}
                  className={`flex items-center p-3 rounded-xl cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-white/50' : 'hover:bg-white/60'}`}
                >
                  <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0">
                    {chat.type === 'generator' ? <Bot className="text-fuchsia-600 w-5 h-5" /> : renderAvatar(chat.avatarBase64)}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-medium text-slate-800 text-sm truncate">{chat.name}</h3>
                    <p className="text-xs text-slate-800/70 truncate">{chat.type === 'generator' ? 'Служебный чат' : 'Тет-а-тет'}</p>
                  </div>
                </div>
              ))}
              {chats.filter(c => c.type === 'single' || c.type === 'generator').length === 0 && (
                <div className="text-center text-slate-800/50 text-sm mt-10">Нет контактов</div>
              )}
            </>
          ) : (
            <>
              {chats.filter(c => c.type === 'group' || c.type === 'plot_generator').map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => { setActiveChatId(chat.id); setIsSidebarOpen(false); }}
                  className={`flex items-center p-3 rounded-xl cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-white/50' : 'hover:bg-white/60'}`}
                >
                  <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0">
                    {chat.type === 'plot_generator' ? <Sparkles className="text-fuchsia-600 w-5 h-5" /> : <Users className="text-fuchsia-600 w-5 h-5" />}
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
                className="flex items-center justify-center w-full py-2.5 bg-white/40 backdrop-blur-xl border border-white/50 border border-indigo-200 text-fuchsia-600 rounded-xl text-sm font-medium hover:bg-white/50 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Создать вручную
              </button>
              <button 
                onClick={startAIGenerator}
                className="flex items-center justify-center w-full py-2.5 bg-fuchsia-600 text-white rounded-xl text-sm font-medium hover:bg-fuchsia-600 hover:bg-fuchsia-500 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-1.5" /> Создать с ИИ
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setShowStoryModal(true)}
                className="flex items-center justify-center w-full py-2.5 bg-fuchsia-600 text-white rounded-xl text-sm font-medium hover:bg-fuchsia-600 hover:bg-fuchsia-500 transition-colors shadow-sm"
              >
                <BookOpen className="w-4 h-4 mr-1.5" /> Начать сюжет
              </button>
              <button 
                onClick={startAIPlotGenerator}
                className="flex items-center justify-center w-full py-2.5 bg-white/50 text-fuchsia-600 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-white/60 transition-colors shadow-sm mt-2"
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
              <div className="w-10 h-10 bg-white/60 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0 border border-indigo-50">
                {activeChat.type === 'generator' ? <Bot className="text-fuchsia-600 w-6 h-6" /> : 
                 activeChat.type === 'plot_generator' ? <Sparkles className="text-fuchsia-600 w-6 h-6" /> : 
                 activeChat.type === 'group' ? <Users className="text-fuchsia-600 w-6 h-6" /> : 
                 renderAvatar(activeChat.avatarBase64)}
              </div>
              <div className="flex-1 overflow-hidden mr-2">
                <h1 className="font-semibold text-slate-800 text-lg leading-tight truncate">{activeChat.name}</h1>
                <p className="text-xs text-slate-800/70">{activeChat.type === 'group' ? `${activeChat.characterIds.length} персонажей` : (activeChat.type === 'generator' ? 'Генерация персонажа' : (activeChat.type === 'plot_generator' ? 'Генерация сюжета' : 'Online'))}</p>
              </div>
            </>
          ) : (
            <div className="flex-1 text-slate-800/70 font-medium">Выберите чат</div>
          )}

          <div className="flex items-center">
            <select 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
              className="text-xs bg-white/60 border border-white/50 text-slate-800/90 rounded-lg p-2 outline-none focus:ring-2 focus:ring-fuchsia-500 max-w-[120px] sm:max-w-none disabled:opacity-50 mr-2"
            >
              <option value="sao10k/l3.3-euryale-70b">Euryale Llama 3.3 70B (Uncensored)</option>
              <option value="anthracite-org/magnum-v4-72b">Magnum v4 72B (Uncensored)</option>
              <option value="nousresearch/hermes-3-llama-3.1-405b">Hermes 3 405B (Uncensored)</option>
              <option value="cognitivecomputations/dolphin-mistral-24b-venice-edition:free">Dolphin Venice (Free, Uncensored)</option>
              <option value="google/gemini-2.0-flash:free">Gemini 2.0 Flash (Free, Censor)</option>
            </select>
            
            {activeChat && (
              <>
                <button 
                  onClick={() => {
                    if (window.confirm('Вы уверены, что хотите очистить историю сообщений в этом чате?')) {
                      clearChatMessages(activeChat.id);
                    }
                  }}
                  className="p-2 text-slate-800/50 hover:text-fuchsia-600 hover:bg-white/50 rounded-lg transition-colors mr-1"
                  title="Очистить историю сообщений"
                >
                  <Eraser className="w-5 h-5" />
                </button>

                <button 
                  onClick={() => {
                    let msg = 'Вы уверены, что хотите полностью удалить этот чат?';
                    if (activeChat.type === 'single') msg = 'Вы уверены, что хотите удалить этот чат и этого персонажа навсегда?';
                    if (activeChat.type === 'group') msg = 'Вы уверены, что хотите удалить этот сюжет?';
                    
                    if (window.confirm(msg)) {
                      deleteChat(activeChat.id);
                    }
                  }}
                  className="p-2 text-slate-800/50 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title={activeChat.type === 'single' ? "Удалить чат и персонажа" : "Удалить чат"}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Chat Messages */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth bg-transparent">
          {!activeChat ? (
            <div className="h-full flex items-center justify-center text-slate-800/50">
              <div className="text-center">
                <Sparkles className="w-12 h-12 text-fuchsia-800/50 mx-auto mb-3" />
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
              const parsed = isUser ? { text: msg.content } : parseMessageContent(msg.content, activeChat.type);
              
              let speakerChar = null;
              if (parsed.speaker && activeChat.type === 'group') {
                speakerChar = characters.find(c => c.name.toLowerCase() === parsed.speaker.toLowerCase());
              }
              
              let avatarSrc = null;
              if (!isUser) {
                if (activeChat.type === 'single') avatarSrc = activeChat.avatarBase64;
                else if (speakerChar) avatarSrc = speakerChar.avatarBase64;
              }
              
              const displayName = isUser ? 'Вы' : (parsed.speaker || (activeChat.type === 'single' ? activeChat.name : (activeChat.type === 'generator' ? 'ИИ' : 'Неизвестный')));

              const extractedJSON = (!isUser && activeChat.type === 'generator') ? extractCharacterJSON(msg.content) : null;

              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
                  <div className={`flex max-w-[90%] sm:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-full bg-white/60 flex-shrink-0 flex items-center justify-center overflow-hidden mb-1 border border-indigo-50 shadow-sm">
                        {activeChat.type === 'generator' ? <Bot className="w-5 h-5 text-indigo-400" /> : renderAvatar(avatarSrc)}
                      </div>
                    )}
                    
                    <div className="flex flex-col">
                      {!isUser && activeChat.type === 'group' && (
                        <span className="text-xs text-slate-800/70 mb-1 ml-1 font-medium">{displayName}</span>
                      )}
                      <div 
                        className={`rounded-2xl p-4 ${
                          isUser 
                            ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-slate-800 rounded-br-sm shadow-md' 
                            : 'bg-white/40 backdrop-blur-xl border border-white/50 text-slate-800 shadow-sm rounded-bl-sm border border-white/40'
                        }`}
                      >
                        <div className={`prose prose-sm max-w-none break-words ${isUser ? 'text-indigo-50 prose-headings:text-slate-800 prose-a:text-fuchsia-800/50 prose-strong:text-slate-800' : 'text-slate-800'}`}>
                          <ReactMarkdown>{parsed.text}</ReactMarkdown>
                        </div>
                        
                        {extractedJSON && (
                          <div className="mt-4 p-4 bg-white/50 rounded-xl border border-indigo-100">
                            <h4 className="font-bold text-fuchsia-900 mb-2 flex items-center gap-2">
                              {extractedJSON.avatar_emoji} {extractedJSON.name}
                            </h4>
                            <p className="text-xs text-fuchsia-700 mb-4 line-clamp-3">{extractedJSON.system_prompt}</p>
                            <button 
                              onClick={() => saveExtractedCharacter(extractedJSON)}
                              className="w-full flex justify-center items-center gap-2 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-slate-800 text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
                            >
                              <Plus className="w-4 h-4" /> Добавить в контакты
                            </button>
                          </div>
                        )}
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

        {/* Input Area */}
        <footer className="bg-white/40 backdrop-blur-xl border border-white/50 p-3 md:p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] shrink-0 z-10">
          <div className="max-w-4xl mx-auto flex items-end bg-white/60 rounded-2xl border border-white/50 p-1 focus-within:ring-2 focus-within:ring-fuchsia-500 focus-within:border-transparent transition-all">
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
              className="p-3 text-fuchsia-600 disabled:text-gray-300 transition-colors hover:text-fuchsia-600"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </footer>
      </div>

      {/* Modal: New Contact */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Новый контакт</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-800/90 mb-2">Аватар (Опционально)</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-transparent border border-white/50 overflow-hidden flex items-center justify-center shrink-0">
                  {newContactAvatar ? <img src={newContactAvatar} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-800/50 w-6 h-6" />}
                </div>
                <label className="cursor-pointer bg-white/40 backdrop-blur-xl border border-white/50 border border-white/60 text-slate-800/90 py-2 px-4 rounded-xl text-sm font-medium hover:bg-white/60 transition w-full text-center">
                  Загрузить фото
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, setNewContactAvatar)} />
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-800/90 mb-1">Имя</label>
              <input 
                type="text" 
                value={newContactName}
                onChange={e => setNewContactName(e.target.value)}
                className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500"
                placeholder="Имя персонажа"
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-800/90 mb-1">Системный промпт / Характер</label>
              <textarea 
                value={newContactPrompt}
                onChange={e => setNewContactPrompt(e.target.value)}
                className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500 resize-none h-28"
                placeholder="Ты заботливый друг..."
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowContactModal(false)} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Отмена</button>
              <button onClick={createContact} disabled={!newContactName || !newContactPrompt} className="px-5 py-2.5 text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">Создать</button>
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
                      className="text-sm text-fuchsia-600 hover:underline mb-2"
                    >
                      ← Назад к выбору сюжета
                    </button>
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-800/90 mb-1">Название сюжета</label>
                      <input 
                        type="text" 
                        value={customScenarioData.title}
                        onChange={e => setCustomScenarioData(prev => ({...prev, title: e.target.value}))}
                        className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500"
                        placeholder="Например: Ограбление банка"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-800/90 mb-1">Сеттинг / Контекст</label>
                      <textarea 
                        value={customScenarioData.world_context}
                        onChange={e => setCustomScenarioData(prev => ({...prev, world_context: e.target.value}))}
                        className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500 resize-none h-28"
                        placeholder="Детальное описание мира, текущей ситуации и правил поведения персонажей..."
                      />
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-slate-800/90 mb-1">Количество участников (персонажей)</label>
                      <select
                        value={customScenarioData.required_characters_count}
                        onChange={e => setCustomScenarioData(prev => ({...prev, required_characters_count: parseInt(e.target.value)}))}
                        className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500 bg-white/40 backdrop-blur-xl border border-white/50"
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
                        className="px-5 py-2.5 text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition w-full"
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
                        <p className="text-xs text-fuchsia-600/80">Напишите собственную историю и выберите количество персонажей</p>
                      </div>
                      <Plus className="text-fuchsia-600 w-5 h-5" />
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
                        <div className="flex items-center text-xs text-fuchsia-600 font-medium">
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
                    className="text-sm text-fuchsia-600 hover:underline mb-2"
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
                        className="w-full border border-white/60 rounded-xl p-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500 bg-white/40 backdrop-blur-xl border border-white/50"
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
                  className="px-5 py-2.5 text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
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
              <label className="block text-sm font-medium text-slate-800/90 mb-2">OpenRouter API Key</label>
              <input 
                type="password" 
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
                className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-fuchsia-500"
                placeholder="sk-or-v1-..."
              />
              <p className="text-xs text-slate-800/70 mt-2">Ваш ключ надежно сохраняется только в вашем браузере (локально) и никуда не передается, кроме API OpenRouter.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSettingsModal(false)} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Закрыть</button>
              <button 
                onClick={() => { setApiKey(tempApiKey); setShowSettingsModal(false); }} 
                className="px-5 py-2.5 text-white bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
