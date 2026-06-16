import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

chub_modal = """
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
                    {char.avatar_url && <img src={`https://avatars.charhub.io/avatars/${char.avatar_url}`} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-bold text-slate-800 text-sm truncate">{char.name}</h4>
                    <p className="text-xs text-slate-800/70 line-clamp-2 mt-1">{char.tagline || char.description}</p>
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
"""

content = re.sub(r'      \{\/\* Modal: New Story \*\/}', chub_modal + '\n      {/* Modal: New Story */}', content)

# Also add the Search Button in the Sidebar under contacts
sidebar_buttons = """              <button 
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
              </button>"""

content = re.sub(r'              <button \n                onClick=\{\(\) => setShowContactModal\(true\)\}\n                className="flex items-center justify-center w-full py-2.5 bg-white\/40 backdrop-blur-xl border border-white\/50 border border-indigo-200 text-violet-500 rounded-xl text-sm font-medium hover:bg-white\/50 transition-colors shadow-sm"\n              >\n                <Plus className="w-4 h-4 mr-1.5" \/> Создать вручную\n              <\/button>', sidebar_buttons, content)


with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
