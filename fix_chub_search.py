import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_search = '''  const searchChub = async (e) => {
    e.preventDefault();
    if (!chubQuery) return;
    setIsChubLoading(true);
    try {
      const res = await fetch(`https://api.chub.ai/search?search=${encodeURIComponent(chubQuery)}&first=30`);
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
              const trRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(text.slice(0, 500))}`);
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
  };'''

content = re.sub(r'  const searchChub = async \(e\) => \{.*?(?=  const importFromChub = async \(fullPath\) => \{)', new_search + '\n\n', content, flags=re.DOTALL)

# Fix image rendering:
# Old: {char.avatar_url && <img src={`https://avatars.charhub.io/avatars/${char.avatar_url}`} className="w-full h-full object-cover" />}
# New: {char.fullPath && <img src={`https://avatars.charhub.io/avatars/${char.fullPath}/chara_card_v2.png`} className="w-full h-full object-cover" />}
# Also update tagline usage to translatedTagline

content = re.sub(r'\{char\.avatar_url && <img src=\{`https://avatars\.charhub\.io/avatars/\$\{char\.avatar_url\}`\} className="w-full h-full object-cover" />\}', r'{char.fullPath && <img src={`https://avatars.charhub.io/avatars/${char.fullPath}/chara_card_v2.png`} onError={(e) => { e.target.onerror = null; e.target.src = `https://avatars.charhub.io/avatars/${char.fullPath}/avatar.webp`; }} className="w-full h-full object-cover" />}', content)

content = re.sub(r'<p className="text-xs text-slate-800/70 line-clamp-2 mt-1">\{char\.tagline \|\| char\.description\}</p>', r'<p className="text-xs text-slate-800/70 line-clamp-2 mt-1">{char.translatedTagline || char.tagline || char.description}</p>', content)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
