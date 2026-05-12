# KeepRSPCT — Clean Code Architecture

KeepRSPCT is a production-grade Telegram moderation bot built with a strict layered architecture. It leverages Google Gemini's vision capabilities to provide real-time, AI-powered NSFW protection for community groups.

---

## 🏗️ Architecture Deep Dive

The project follows a modular **Layered Architecture** to ensure separation of concerns, testability, and long-term maintainability.

### 1. Controller Layer (`src/controllers/`)
The `ModerationController` acts as the orchestrator. It listens to Telegram events (via `index.ts`), validates the basic request state, and coordinates between various services. It contains no direct business logic regarding AI analysis or low-level API calls.

### 2. Service Layer (`src/services/`)
- **AIService:** Encapsulates the logic for interacting with Google's Generative AI. It manages request queueing, rate-limit backoff, and multi-key failover logic.
- **GuardService:** Manages the enforcement of moderation rules (banning, unbanning, deleting messages).

### 3. Utility Layer (`src/utils/`)
- **PersistentCache:** A repository-like pattern for long-term data storage, ensuring user profile statuses are preserved across restarts.
- **MediaHelper:** Handles the heavy lifting of media acquisition and preprocessing via worker threads.
- **Config & Constants:** Centralized management of environment variables and magic strings.

---

## 🛠️ Tech Stack & Rationale

- **GrammY:** Chosen for its lightweight, high-performance middleware system and first-class TypeScript support.
- **Google Gemini 2.0 Flash:** Provides state-of-the-art vision analysis with sub-second latency and a generous free tier for community bots.
- **Sharp:** The industry standard for high-speed image processing, utilized here via worker threads to keep the Node.js event loop responsive.
- **Node-Cache:** Provides an extremely fast L1 memory layer for recent media scans.

---

## 🔄 Core Logic Flow

1. **Ingress:** A photo, sticker, or reaction is received by the `grammy` bot.
2. **L1 Cache Lookup:** The `ModerationController` checks if the media's `file_unique_id` is already in the memory cache.
3. **Admin Validation:** The bot verifies if the sender is an administrator (admins are exempt from scanning to save API quota).
4. **Media Processing:** If not cached, the `MediaHelper` downloads the media and spawns a **Worker Thread** to resize/reformat the image into an AI-optimized JPEG.
5. **AI Evaluation:** The `AIService` acquires a slot in the `RequestQueue` and sends the processed image to Gemini.
6. **Enforcement:** If NSFW is detected, the `GuardService` executes a parallel `deleteMessage` and `banChatMember` operation.
7. **L2 Persistance:** The result is saved to `user_cache.json` to ensure the user is blocked from re-joining.

---

## 🛡️ Edge Case Handling

- **Atomic Writes:** Cache persistence uses a `temp-file -> rename` strategy to prevent data corruption during crashes.
- **Race Condition Guard:** "In-Flight Request Tracking" ensures that multiple simultaneous messages from a single new user don't trigger duplicate AI requests.
- **Fail-Safe Processing:** If an AI key fails or a rate limit is hit, the system automatically rotates to the next available key or implements an exponential backoff.
- **Image Bomb Protection:** Strict `maxContentLength` and pixel limits are enforced during media download to prevent memory exhaustion attacks.

---

## 📈 Future Scalability

- **Database Migration:** The `PersistentCache` is designed to be easily swappable with a `Redis` or `PostgreSQL` implementation as the bot scales to thousands of groups.
- **Provider Agnostic AI:** The `AIService` can be extended to support OpenAI or Anthropic vision models with minimal changes to the controller logic.
- **Clustering:** By offloading CPU tasks to workers and using a centralized cache, the bot is ready for horizontal scaling across multiple containers.
