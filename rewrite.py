import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

modal_ui = """      {/* Modal: New Contact */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Новый персонаж</h3>
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
                      <div className="w-16 h-16 rounded-full bg-transparent border border-white/50 overflow-hidden flex items-center justify-center shrink-0">
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
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Системный промпт (Инструкции)</label>
                    <textarea 
                      value={newContactPrompt}
                      onChange={e => setNewContactPrompt(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-y h-24"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Первое сообщение</label>
                    <textarea 
                      value={newContactFirstMes}
                      onChange={e => setNewContactFirstMes(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-y h-24"
                    />
                  </div>
                </>
              )}

              {contactModalTab === 'details' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Описание (Внешность, Бэкграунд)</label>
                    <textarea 
                      value={newContactDescription}
                      onChange={e => setNewContactDescription(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-y h-32"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Характер</label>
                    <textarea 
                      value={newContactPersonality}
                      onChange={e => setNewContactPersonality(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-y h-24"
                    />
                  </div>
                </>
              )}

              {contactModalTab === 'examples' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Сценарий / Мир</label>
                    <textarea 
                      value={newContactScenario}
                      onChange={e => setNewContactScenario(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-y h-24"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800/90 mb-1">Примеры диалогов (mes_example)</label>
                    <textarea 
                      value={newContactMesExample}
                      onChange={e => setNewContactMesExample(e.target.value)}
                      className="w-full border border-white/60 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-violet-400 resize-y h-48"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-white/40 shrink-0">
              <button onClick={() => setShowContactModal(false)} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Отмена</button>
              <button onClick={createContact} disabled={!newContactName} className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">Создать</button>
            </div>
          </div>
        </div>
      )}"""

content = re.sub(r'      \{\/\* Modal: New Contact \*\/}.*?(?=      \{\/\* Modal: New Story \*\/})', modal_ui + '\n\n', content, flags=re.DOTALL)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
