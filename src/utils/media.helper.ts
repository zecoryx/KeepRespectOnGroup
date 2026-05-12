import axios from 'axios';
import { Api } from 'grammy';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MediaHelper {
    private api: Api;
    private static readonly MAX_FILE_SIZE = 20 * 1024 * 1024;

    constructor(token: string) {
        this.api = new Api(token);
    }

    /**
     * Downloads a Telegram file and processes it in a Worker Thread to keep the Event Loop free.
     */
    async downloadAsBase64(fileId: string): Promise<string> {
        try {
            const file = await this.api.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            
            const response = await axios.get(fileUrl, {
                responseType: 'arraybuffer',
                timeout: 10000,
                maxContentLength: MediaHelper.MAX_FILE_SIZE,
                maxBodyLength: MediaHelper.MAX_FILE_SIZE
            });
            const buffer = Buffer.from(response.data);

            if (!buffer || buffer.length === 0) throw new Error('Empty buffer');

            // Offload CPU-heavy sharp processing to a Worker Thread
            return await this.runWorker(buffer);
        } catch (error: any) {
            console.error('[Media Error]: Media processing failed.');
            throw new Error('MediaProcessingError');
        }
    }

    private runWorker(buffer: Buffer): Promise<string> {
        return new Promise((resolve, reject) => {
            const workerPath = path.resolve(__dirname, 'image.worker.js');
            const worker = new Worker(workerPath, {
                workerData: { 
                    buffer, 
                    width: 224, 
                    height: 224, 
                    quality: 60 
                }
            });

            worker.on('message', (msg) => {
                if (msg.success) resolve(msg.base64);
                else reject(new Error(msg.error));
                worker.terminate();
            });

            worker.on('error', (err) => {
                reject(err);
                worker.terminate();
            });

            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
            });
        });
    }

    async getCustomEmojiBase64(customEmojiId: string): Promise<string | null> {
        try {
            const stickers = await this.api.getCustomEmojiStickers([customEmojiId]);
            if (stickers.length > 0) return await this.downloadAsBase64(stickers[0].file_id);
            return null;
        } catch (error: any) {
            return null;
        }
    }
}
