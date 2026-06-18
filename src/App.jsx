import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { compressImage } from './utils/imageCompressor';
import TextareaAutosize from 'react-textarea-autosize';
import { Send, User, Menu, X, Plus, Users, Image as ImageIcon, Sparkles, BookOpen, Bot, Settings, Trash2, Eraser, Star, ArrowDown, Pencil, Check, ChevronDown, ChevronRight, Loader2, GitBranch } from 'lucide-react';
import { useStore } from './store/useStore';
import scenarios from './data/scenarios.json';
import { parseTavernCard } from './utils/pngParser';

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

function App() {
  const { characters, chats, activeChatId, apiKey, setApiKey, autoTranslate, setAutoTranslate, setActiveChatId, addCharacter, updateCharacter, importCharacter, addChat, addMessageToChat, clearChatMessages, deleteChat, deleteCharacter, favoriteModels, toggleFavoriteModel, selectedModel, setSelectedModel, deleteMessageFromChat, editMessageInChat, updateChatSummary, updateChatField, userName, setUserName } = useStore();
  

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' | 'stories'
  const [expandedCharacters, setExpandedCharacters] = useState({});
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryModalChatId, setSummaryModalChatId] = useState(null);
  const [summaryModalText, setSummaryModalText] = useState("");
  
  const [showContactModal, setShowContactModal] = useState(false);
  const [showChubModal, setShowChubModal] = useState(false);
  const [chubQuery, setChubQuery] = useState('');
  const [chubIncludeNsfw, setChubIncludeNsfw] = useState(true);
  const [chubIncludeVenus, setChubIncludeVenus] = useState(true);
  const [chubResults, setChubResults] = useState([]);
  const [isChubLoading, setIsChubLoading] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [input, setInput] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempUserName, setTempUserName] = useState('');
  const [tempChatUserName, setTempChatUserName] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');
  const messagesEndRef = useRef(null);

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
                    <TextareaAutosize 
                      minRows={3}
                      value={newContactMesExample}
                      onChange={e => setNewContactMesExample(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400"
                    />
                  </div>
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
            
            <form onSubmit={searchChub} className="flex gap-2 mb-4">
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

    </div>
  );
}

export default App;
