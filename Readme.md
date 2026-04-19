# KeepRSPCT - Telegram Moderation Bot

KeepRSPCT is a high-performance, AI-driven Telegram moderation bot designed to protect communities from NSFW (Not Safe For Work) content. Built with **SOLID** principles, local persistent caching, and advanced AI vision models, it efficiently handles high-traffic groups while maintaining pinpoint accuracy.

![KeepRSPCT Infrastructure Diagram](https://img.shields.io/badge/Architecture-SOLID-blue) ![Caching](https://img.shields.io/badge/Caching-Persistent_&_In_Memory-green) ![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)

## Core Features

- **Advanced AI Vision Validation:** Uses Multimodal LLMs (like GLM-5 or GPT-4-Vision) to scan profile photos, group messages, stickers, and custom emoji reactions.
- **Hallucination & Blindness Defensive Checks:** Includes rigid guardrails to bypass AI safety filters effectively (via description extraction rather than boolean Q&A) and safely skips scans if the API goes temporarily blind.
- **Smart Per-Group Caching:** Integrates both `node-cache` (for fast message scans) and a custom `PersistentCache` relying on asynchronous file I/O to survive server restates. Users are evaluated once per group per week.
- **Zero False-Positive Target:** Excludes "ordinary selfies" or regular "skin" exposure by using highly tuned Regex filtering applied strictly over the AI's internal target descriptions.
- **Concurrent Traffic Queues:** AI request semaphores ensure you never flood the LLM API endpoints during traffic spikes.
- **Anti-Spam Admin Bypass:** Group owners and administrators bypass AI checks entirely to optimize API cost.

## Quick Start

### 1. Requirements

- Node.js v18+
- TypeScript
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- An AI API Key supporting Vision models (FlowClad, Zhipu GLM, or OpenAI)

### 2. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/zecoryx/KeepRSPCT.git
cd KeepRSPCT
npm install
```

### 3. Configuration

Copy the sample environment file and add your credentials:

```bash
cp .env.example .env
```

Update `.env`:

```env
BOT_TOKEN=your_telegram_bot_token_here
AI_API_KEY=your_vision_api_key_here
AI_BASE_URL=https://api.flowclad.zecoryx.uz/v1/chat/completions
AI_MODEL=model_name
```

### 4. Running the Bot

For development environments (with auto-reload):

```bash
npm run dev
```

For production deployment:

```bash
npm start
```

## Under the Hood (Architecture)

KeepRSPCT is built keeping **Clean Code** and **SOLID** architecture in mind:

1.  **Dependency Injection:** `src/index.ts` is purely a bootstrapping entry script that wires Telegram event routes directly into the `ModerationController`.
2.  **Controller Layer (`moderation.controller.ts`):** Abstracts heavy moderation flows—evaluating logic, delegating cache manipulation, and passing media base64 down to the AI.
3.  **Services:**
    - `ai.service.ts`: Handles prompt wrappers, LLM hallucination prevention, regex validations, API timeout configurations, and semaphore HTTP queuing.
    - `guard.service.ts`: Handles Telegram kick/ban mutations and deletion hooks.
4.  **Utilities:**
    - `cache.ts`: Class-based File I/O for persistent, restart-safe data states.
    - `media.helper.ts`: Memory-efficient buffer loading via `sharp` to convert robust API streams into minimal base64 tokens for the AI endpoints.
    - `timeout.ts`: Promise-based `Promise.race` handlers preventing deadlocks during high network latency.

## Contributing

Contributions are always welcome! If you think of a new feature or find a bug, please open an Issue or submit a Pull Request. Provide logs and exact `.env` configurations (without keys!) if reporting a bug.

## License

This project is open-sourced under the MIT License.
