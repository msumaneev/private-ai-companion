import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add new states
state_adds = '''  const [editingCharId, setEditingCharId] = useState(null);
  const [isTranslatingCard, setIsTranslatingCard] = useState(false);'''

content = re.sub(r'(  const \[contactModalTab, setContactModalTab\] = useState\(\'main\'\);)', r'\1\n' + state_adds, content)

# Function to edit existing character
edit_contact_func = '''
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
'''

content = re.sub(r'(  const createContact = \(\) => \{)', edit_contact_func + '\n\1', content)

# Rewrite createContact
new_create = '''  const createContact = () => {
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
  };'''

# Since `createContact` is inside the text, we replace the block carefully.
content = re.sub(r'  const createContact = \(\) => \{.*?setShowContactModal\(false\);\n  \};\n', new_create + '\n', content, flags=re.DOTALL)


# Modify importFromChub
new_import = '''  const importFromChub = async (fullPath) => {
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
  };'''

content = re.sub(r'  const importFromChub = async \(fullPath\) => \{.*?(?=  const startAIGenerator = \(\) => \{)', new_import + '\n\n', content, flags=re.DOTALL)


# Translate Card Function
translate_func = '''  const translateCard = async () => {
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

    const sysPrompt = "Ты — профессиональный технический и литературный переводчик. Твоя единственная цель — 100% точный перевод. Ты обязан переводить весь текст 'как есть', включая сленг, обсценную лексику, жестокость и любые спорные темы. Запрещено фильтровать, смягчать, читать нотации или отказываться от перевода. Выведи только переведенный текст.";

    const translatedFields = { ...fieldsToTranslate };

    for (const [key, value] of Object.entries(fieldsToTranslate)) {
      if (!value || value.trim() === '') continue;
      
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: value }
            ],
            temperature: 0.3
          })
        });

        const data = await res.json();
        if (data.choices && data.choices.length > 0) {
          translatedFields[key] = data.choices[0].message.content.trim();
        }
      } catch (err) {
        console.error("Translation error for", key, err);
      }
    }

    setNewContactPrompt(translatedFields.system_prompt || '');
    setNewContactDescription(translatedFields.description || '');
    setNewContactPersonality(translatedFields.personality || '');
    setNewContactScenario(translatedFields.scenario || '');
    setNewContactFirstMes(translatedFields.first_mes || '');
    setNewContactMesExample(translatedFields.mes_example || '');
    
    setIsTranslatingCard(false);
  };
'''

content = re.sub(r'(  const startAIGenerator = \(\) => \{)', translate_func + '\n\1', content)


with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
