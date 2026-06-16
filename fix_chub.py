import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_search_logic = """  const searchChub = async (e) => {
    e.preventDefault();
    if (!chubQuery) return;
    setIsChubLoading(true);
    try {
      const res = await fetch(`https://api.chub.ai/search?search=${encodeURIComponent(chubQuery)}&first=30`);
      const data = await res.json();
      setChubResults(data.data?.nodes || data.nodes || []);
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
        
        const newChar = addCharacter({
          name: char.name,
          avatarBase64: base64data,
          description: char.description || '',
          personality: char.personality || '',
          scenario: char.scenario || '',
          first_mes: char.first_mes || '',
          mes_example: char.mes_example || '',
          system_prompt: char.system_prompt || '',
        });

        const newChat = addChat({
          type: 'single',
          name: char.name,
          avatarBase64: base64data,
          characterIds: [newChar.id]
        });

        if (char.first_mes) {
          addMessageToChat(newChat.id, { role: 'assistant', content: char.first_mes, name: char.name });
        }

        setShowChubModal(false);
        alert('Персонаж успешно добавлен!');
      };
      reader.readAsDataURL(blob);

    } catch (err) {
      alert('Ошибка скачивания: ' + err.message);
    }
  };"""

content = re.sub(r'  const searchChub = async \(e\) => \{.*?(?=  const startAIGenerator = \(\) => \{)', new_search_logic + '\n\n', content, flags=re.DOTALL)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
