# Private AI Companion

A completely serverless, private, and customizable AI companion / roleplay web app. It runs entirely in your browser using the **Bring Your Own Key (BYOK)** model.

## Features

- **100% Private (Local First)**: Your chat history, characters, and API keys are stored locally in your browser (via `IndexedDB` and `zustand`). No external databases track your private conversations.
- **End-to-End Encrypted Multiplayer**: Share a chat room via a secure invite link! Room data is synced via Firebase but encrypted client-side using a 256-bit AES key. The server never sees the plaintext.
- **Tavern PNG Support**: Easily import your favorite AI character cards by simply uploading their Tavern-formatted PNG images.
- **Serverless OpenRouter Integration**: Connects directly to [OpenRouter.ai](https://openrouter.ai) API from the client side. Switch between state-of-the-art models (like Llama 405B, Claude, or Hermes) on the fly and mark your favorites.
- **Group Roleplay (Stories)**: Mix and match your created AI characters in pre-defined scenarios. The AI intelligently plays all roles in the same chat!
- **AI Character & Plot Generator**: Don't want to write cards manually? Simply describe what kind of character or story you want, and the built-in AI expert will generate their persona, scenario, and avatar automatically.
- **Memory & Summarization**: "Branch" a long chat! The AI can compress your long chat history into a short summary, clear the message log to save context tokens, and continue the story seamlessly.
- **PWA Ready**: Install it as a standalone app on your phone (iOS/Android) or desktop for a native experience.

## How to Use

Since the app is hosted on GitHub Pages, you can use it completely free without running any local servers!

1. Open the [Live App URL](https://msumaneev.github.io/private-ai-companion/).
2. Open the **Settings** (⚙️) from the sidebar menu.
3. Paste your [OpenRouter API Key](https://openrouter.ai/keys).
4. Create characters (or upload Tavern PNGs) and start chatting!
5. To invite a friend to an encrypted chat, open a character, click the **Share** (🔗) button in the header, and send them the link.

## Installation for Development

If you want to run or modify the app locally:

```bash
git clone https://github.com/msumaneev/private-ai-companion.git
cd private-ai-companion
npm install
npm run dev
```

## Technologies Used
- **Frontend Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 + Lucide Icons
- **State Management**: Zustand + idb-keyval
- **Network & Realtime**: Firebase (Firestore/RTDB)
- **Security**: Web Crypto API (AES-GCM encryption)
- **AI Provider**: OpenRouter API
- **Deployment**: Vite PWA & GitHub Actions
