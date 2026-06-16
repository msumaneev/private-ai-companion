import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace "Создать" with "Сохранить" depending on editingCharId
# Also add "Translate to Russian" button
modal_footer = '''            <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-white/40 shrink-0">
              <button onClick={translateCard} disabled={isTranslatingCard || !apiKey} className="px-5 py-2.5 mr-auto text-white bg-blue-500 hover:bg-blue-600 rounded-xl text-sm font-medium disabled:opacity-50 transition flex items-center">
                {isTranslatingCard ? 'Перевод...' : 'Перевести на русский'}
              </button>
              <button onClick={() => setShowContactModal(false)} className="px-5 py-2.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Отмена</button>
              <button onClick={createContact} disabled={!newContactName} className="px-5 py-2.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium disabled:opacity-50 transition">
                {editingCharId ? 'Сохранить' : 'Создать'}
              </button>
            </div>'''

content = re.sub(r'            <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-white/40 shrink-0">\n              <button onClick=\{\(\) => setShowContactModal\(false\)\} className="px-5 py-2\.5 text-slate-800/80 bg-transparent rounded-xl text-sm font-medium hover:bg-white/50 transition">Отмена</button>\n              <button onClick=\{createContact\} disabled=\{!newContactName\} className="px-5 py-2\.5 text-white bg-violet-400 hover:bg-violet-500 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition">Создать</button>\n            </div>', modal_footer, content)

# Update modal title
content = re.sub(r'<h3 className="text-xl font-bold text-slate-800">Новый персонаж</h3>', r'<h3 className="text-xl font-bold text-slate-800">{editingCharId ? "Редактирование" : "Новый персонаж"}</h3>', content)

# Now, add "Edit" button to contacts list
# Search for Contact mapping
contact_button_replacement = '''                  <div className="flex-1 text-left">
                    <div className="font-bold text-slate-800 text-sm">{char.name}</div>
                    <div className="text-xs text-slate-800/60 truncate w-32">{char.system_prompt || char.description || 'Нет описания...'}</div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); openEditContact(char); }} 
                    className="p-2 text-slate-800/40 hover:text-violet-500 hover:bg-white/40 rounded-lg transition-colors ml-2"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </button>'''

content = re.sub(r'                  <div className="flex-1 text-left">\n                    <div className="font-bold text-slate-800 text-sm">\{char\.name\}</div>\n                    <div className="text-xs text-slate-800/60 truncate w-32">\{char\.system_prompt \|\| \'Нет описания\.\.\.\'\}</div>\n                  </div>\n                </button>', contact_button_replacement, content)


with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
