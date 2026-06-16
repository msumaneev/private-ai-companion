import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Google Translate CORS issue using allorigins proxy
new_translate = '''const trRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(text.slice(0, 500))}`)}`);'''

content = re.sub(r'const trRes = await fetch\(`https://translate\.googleapis\.com.*?`\);', new_translate, content)

# Fix Avatar URL logic
# Find: {char.fullPath && <img src={`https://avatars.charhub.io/avatars/${char.fullPath}/chara_card_v2.png`} onError={(e) => { e.target.onerror = null; e.target.src = `https://avatars.charhub.io/avatars/${char.fullPath}/avatar.webp`; }} className="w-full h-full object-cover" />}
# Replace with: {char.avatar_url ? <img src={char.avatar_url} className="w-full h-full object-cover" /> : char.fullPath && <img src={`https://avatars.charhub.io/avatars/${char.fullPath}/avatar.webp`} className="w-full h-full object-cover" />}

content = re.sub(
    r'\{char\.fullPath && <img src=\{`https://avatars\.charhub\.io/avatars/\$\{char\.fullPath\}/chara_card_v2\.png`\}.*?className="w-full h-full object-cover" />\}',
    r'{char.avatar_url ? <img src={char.avatar_url.startsWith("http") ? char.avatar_url : `https://avatars.charhub.io/avatars/${char.avatar_url}`} className="w-full h-full object-cover" /> : <img src={`https://avatars.charhub.io/avatars/${char.fullPath}/avatar.webp`} className="w-full h-full object-cover" />}',
    content
)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
