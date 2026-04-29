import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { RequestQueue } from "../utils/queue.js";

dotenv.config();

const NSFW_PROMPT = `Is this profile picture appropriate for a general audience group chat?
Reply with EXACTLY one word: YES if appropriate, NO if not appropriate.`;

interface KeyModelPair {
  client: GoogleGenerativeAI;
  model: string;
  label: string;
}

export class AIService {
  private requestQueue: RequestQueue;
  private chain: KeyModelPair[] = [];
  private activeIdx = 0;
  private allExhausted = false;

  private static readonly MODEL_ORDER = ["gemini-2.0-flash"];

  constructor() {
    this.requestQueue = new RequestQueue(2);

    const keys = [
      { raw: process.env.GOOGLE_API_KEY  || "", num: 1 },
      { raw: process.env.GOOGLE_API_KEY2 || "", num: 2 },
    ];

    for (const { raw, num } of keys) {
      if (!raw) continue;
      const client = new GoogleGenerativeAI(raw);
      for (const model of AIService.MODEL_ORDER) {
        this.chain.push({ client, model, label: `Key${num}/${model}` });
      }
    }

    if (this.chain.length === 0) {
      console.warn("[AI]: GOOGLE_API_KEY not set — vision disabled. Get a free key: https://aistudio.google.com/apikey");
    }
  }

  async testConnection(): Promise<string> {
    const pair = this.chain[0];
    if (!pair) return "❌ No API key configured.";
    try {
      const start = Date.now();
      const model = pair.client.getGenerativeModel({ model: pair.model });
      const result = await model.generateContent("Say OK");
      const elapsed = Date.now() - start;
      const text = result.response.text().trim();
      return `✅ Model: ${pair.model} | Response: "${text}" | Time: ${elapsed}ms`;
    } catch (error: any) {
      return `❌ Model: ${pair.model} | Error: ${error.message}`;
    }
  }

  async analyzeNSFW(base64ImageSource: string): Promise<"YES" | "NO" | "ERROR"> {
    if (this.allExhausted || this.chain.length === 0) return "ERROR";

    await this.requestQueue.acquire();
    const start = Date.now();

    try {
      const cleanBase64 = base64ImageSource.replace(/[\s\r\n]/g, "");
      const request = {
        contents: [{
          role: "user",
          parts: [
            { text: NSFW_PROMPT },
            { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
          ],
        }],
      };

      let result: any = null;

      while (this.activeIdx < this.chain.length) {
        const pair = this.chain[this.activeIdx];

        try {
          const geminiModel = pair.client.getGenerativeModel({
            model: pair.model,
            generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } } as any,
          });
          result = await geminiModel.generateContent(request);
          break;

        } catch (err: any) {
          const status: number = err.status ?? err.httpErrorCode ?? 0;
          const msg: string = err.message ?? "";

          if (status === 400 && msg.includes("API_KEY_INVALID")) {
            console.error(`[AI]: ${pair.label} — invalid key, skipping`);
            this.advance();
            continue;
          }

          if (status === 429 && (msg.includes("PerDay") || msg.includes("per_day"))) {
            this.advance();
            continue;
          }

          if (status === 429) {
            const waitSec = Math.ceil(parseFloat(msg.match(/"retryDelay":"([\d.]+)s"/)?.[1] ?? "15")) + 1;
            console.log(`[AI]: Rate limit on ${pair.label} — waiting ${waitSec}s`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            try {
              const geminiModel = pair.client.getGenerativeModel({
                model: pair.model,
                generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } } as any,
              });
              result = await geminiModel.generateContent(request);
              break;
            } catch {
              this.advance();
              continue;
            }
          }

          if (status === 503) {
            this.advance();
            continue;
          }

          throw err;
        }
      }

      if (!result) {
        this.allExhausted = true;
        console.error("[AI]: All options exhausted for today. Scanning paused until quota resets (UTC 00:00).");
        return "ERROR";
      }

      if (result.response.promptFeedback?.blockReason) return "ERROR";

      const finishReason = result.response.candidates?.[0]?.finishReason;
      if (finishReason === "SAFETY") return "YES";

      let rawContent = "";
      try { rawContent = result.response.text().trim().toLowerCase(); } catch { return "YES"; }

      if (!rawContent) return "ERROR";

      const firstWord = rawContent.split(/[\s.,!?;:\n]/)[0].replace(/[^a-z]/g, "");
      if (firstWord === "yes") return "NO";
      if (firstWord === "no")  { console.log(`[Ban]: NSFW detected (${Math.round(cleanBase64.length / 1024)}KB, ${Date.now() - start}ms)`); return "YES"; }

      if (/\byes\b/.test(rawContent)) return "NO";
      if (/\bno\b/.test(rawContent))  return "YES";

      return "ERROR";

    } catch (error: any) {
      console.error(`[AI Error]: ${error.message}`);
      return "ERROR";
    } finally {
      this.requestQueue.release();
    }
  }

  private advance(): void {
    this.activeIdx++;
    if (this.activeIdx < this.chain.length) {
      const next = this.chain[this.activeIdx];
      console.log(`[AI]: Quota/error — switched to ${next.label} (${this.activeIdx + 1}/${this.chain.length})`);
    }
  }
}
