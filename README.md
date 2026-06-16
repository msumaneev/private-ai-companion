# Private AI Companion

A completely serverless, private, and customizable AI companion / roleplay web app. It runs entirely in your browser using the **Bring Your Own Key (BYOK)** model.

## Features

- **100% Private**: Your chat history, characters, and API keys are stored locally in your browser (via `localStorage` and `zustand`). No external databases or tracking.
- **Serverless**: Connects directly to [OpenRouter.ai](https://openrouter.ai) API from the client side.
- **Group Roleplay (Stories)**: Mix and match your created AI characters in pre-defined scenarios. The AI intelligently plays all roles in the same chat!
- **AI Character Generator**: Simply describe what kind of character you want, and the built-in AI expert (using Llama 405B) will generate their persona and avatar automatically.
- **PWA Ready**: Install it as a standalone app on your phone or desktop.

## How to Use

Since the app is hosted on GitHub Pages, you can use it completely free without running any local servers!

1. Open the [Live App URL](https://<YOUR-USERNAME>.github.io/private-ai-companion/).
2. Open the **Settings** (⚙️) from the sidebar menu.
3. Paste your [OpenRouter API Key](https://openrouter.ai/keys).
4. Start creating characters and chatting!

## Installation for Development

If you want to run or modify the app locally:

```bash
git clone https://github.com/<YOUR-USERNAME>/private-ai-companion.git
cd private-ai-companion
npm install
npm run dev
```

## Technologies Used
- React 19 + Vite
- Tailwind CSS v4
- Zustand (State management & Persistence)
- OpenRouter API (Access to Llama 3.1 70B & 405B)
- Vite PWA (Offline & Installation support)
