export const parseTavernCard = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const view = new DataView(buffer);
        
        // Check PNG signature
        if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
          throw new Error('Not a valid PNG file');
        }

        let offset = 8;
        let charaData = null;

        while (offset < view.byteLength) {
          const length = view.getUint32(offset);
          const type = String.fromCharCode(
            view.getUint8(offset + 4),
            view.getUint8(offset + 5),
            view.getUint8(offset + 6),
            view.getUint8(offset + 7)
          );

          if (type === 'tEXt' || type === 'iTXt') {
            const dataBytes = new Uint8Array(buffer, offset + 8, length);
            const textDecoder = new TextDecoder('utf-8');
            let textStr = textDecoder.decode(dataBytes);

            if (type === 'iTXt') {
              const nullIndex = textStr.indexOf('\0');
              const keyword = textStr.substring(0, nullIndex);
              if (keyword === 'chara') {
                let currentNull = nullIndex;
                for (let i = 0; i < 2; i++) {
                  currentNull = textStr.indexOf('\0', currentNull + 1);
                }
                const base64Data = textStr.substring(currentNull + 1);
                charaData = base64Data;
                break;
              }
            } else if (type === 'tEXt') {
              const nullIndex = textStr.indexOf('\0');
              const keyword = textStr.substring(0, nullIndex);
              if (keyword === 'chara') {
                charaData = textStr.substring(nullIndex + 1);
                break;
              }
            }
          }

          if (type === 'IEND') break;
          offset += 12 + length;
        }

        if (!charaData) {
          throw new Error('В этом PNG нет данных персонажа (не Tavern формат)');
        }

        let decodedStr = '';
        try {
            const binString = atob(charaData);
            const bytes = new Uint8Array(binString.length);
            for (let i = 0; i < binString.length; i++) {
                bytes[i] = binString.charCodeAt(i);
            }
            decodedStr = new TextDecoder('utf-8').decode(bytes);
        } catch (err) {
            decodedStr = charaData; // if not base64
        }

        const jsonData = JSON.parse(decodedStr);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsArrayBuffer(file);
  });
};
