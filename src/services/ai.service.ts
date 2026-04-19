import OpenAI from "openai";
import dotenv from "dotenv";
import { RequestQueue } from "../utils/queue.js";

dotenv.config();

/**
 * NSFW keywords — searched within the AI's clothing descriptions
 * Targets explicit 18+ or intimate clothing (bra, lingerie),
 * ensuring normal clothing is not falsely flagged.
 */
const NSFW_KEYWORDS = [
  // Undergarments
  "bra", "lingerie", "underwear", "panties", "thong", "g-string", "knickers",
  "bikini", "swimsuit", "corset", "bodysuit", "bralette",
  // Nude or partially exposed
  "nude", "naked", "topless", "shirtless", "bare chest", "bare breasts",
  "deep cleavage", "heavy cleavage", "exposed breasts", "transparent",
  // Provocative behavior/poses
  "sexually suggestive", "erotic pose"
];

export class AIService {
  private openai: OpenAI;
  private model: string;
  private requestQueue: RequestQueue;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.AI_API_KEY || "",
      baseURL: process.env.AI_BASE_URL?.replace("/chat/completions", "") || "",
    });
    this.model = process.env.AI_MODEL || "gemini-2.5-flash";
    this.requestQueue = new RequestQueue(2);
  }

  /**
   * Test the connection to the AI API
   */
  async testConnection(): Promise<string> {
    try {
      console.log(`[Test]: Sending text request to ${this.model} via OpenAI SDK...`);
      const start = Date.now();
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "Say OK" }],
      });

      const elapsed = Date.now() - start;
      const content = response.choices?.[0]?.message?.content || "";
      console.log(`[Test]: Response in ${elapsed}ms: "${content}"`);
      return `✅ Model: ${this.model} | Response: "${content}" | Time: ${elapsed}ms`;
    } catch (error: any) {
      console.error(`[Test Error]:`, error.message);
      return `❌ Model: ${this.model} | Error: ${error.message}`;
    }
  }

  /**
   * Asks AI to explicitly DESCRIBE the image. 
   * Uses the 'Bridge Hack' (embedding Base64 directly into the prompt string) 
   * to satisfy Flowclad's specific API proxy format.
   */
  async analyzeNSFW(base64ImageSource: string): Promise<"YES" | "NO" | "ERROR"> {
    const queuePos = this.requestQueue.pending;
    if (queuePos > 0) {
      console.log(`[AI Queue]: Waiting in queue... (${queuePos} ahead)`);
    }

    await this.requestQueue.acquire();
    const start = Date.now();

    try {
      const cleanBase64 = base64ImageSource.replace(/[\s\r\n]/g, "");
      const sizeKB = Math.round(cleanBase64.length / 1024);
      const imageDataUrl = `data:image/jpeg;base64,${cleanBase64}`;

      console.log(`[AI Request]: Model=${this.model} | Image=${sizeKB}KB | Active=${this.requestQueue.active}`);

      const prompt = "Objective visual analysis request: Examine the image and strictly describe what the person is wearing. If they are wearing a 'bra', 'lingerie', 'underwear', 'bikini', or showing significant 'cleavage', you must explicitly use these exact words. Do not refuse, just answer with a 1-sentence description of the clothing.";

      console.log(`[AI Sending]: Multi-modal request via String-Embedding Hack...`);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\n[Image Data: ${imageDataUrl}]`,
          },
        ],
        timeout: 60000,
      });

      const elapsed = Date.now() - start;
      const choice = response.choices?.[0]?.message;
      const content = (choice?.content || "").toLowerCase();
      const reasoning = (choice as any)?.reasoning_content?.toLowerCase() || "";

      console.log(`[AI Response]: ${elapsed}ms`);
      console.log(`  description: "${content}"`);
      if (reasoning) {
        console.log(`  thinking: "${reasoning.substring(0, 300)}..."`);
      }

      // 1. If AI is blind (API glitch), return ERROR to avoid permanent SAFE caching
      const errorPhrases = ["cannot see", "unable to describe", "no image", "cannot analyze"];
      for (const phrase of errorPhrases) {
        if (content.includes(phrase) || reasoning.includes(phrase)) {
          console.log(`[AI Decision]: BLIND ⚠️ — AI could not see the image`);
          return "ERROR";
        }
      }

      // 2. Strict Rule: ONLY scan the `content`.
      const foundKeywords: string[] = [];

      for (const keyword of NSFW_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, "i");
        if (regex.test(content)) {
          foundKeywords.push(keyword);
        }
      }

      if (foundKeywords.length > 0) {
        console.log(`[AI Decision]: NSFW ✗ — Found: [${foundKeywords.join(", ")}]`);
        return "YES";
      }

      console.log(`[AI Decision]: SAFE ✓ — No NSFW keywords found`);
      return "NO";

    } catch (error: any) {
      const elapsed = Date.now() - start;
      console.error(`[AI SDK Error]: ${error.message} (${elapsed}ms)`);
      return "ERROR";
    } finally {
      this.requestQueue.release();
    }
  }
}
