import axios from 'axios';
import sharp from 'sharp';
import { Api } from 'grammy';

export class MediaHelper {
    private api: Api;

    constructor(token: string) {
        this.api = new Api(token);
    }

    /**
     * Downloads a Telegram file and converts it to a Base64 string.
     */
    async downloadAsBase64(fileId: string): Promise<string> {
        try {
            console.log(`[Media]: Getting file info for ${fileId.substring(0, 20)}...`);
            const file = await this.api.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            
            console.log(`[Media]: Downloading ${file.file_path}...`);
            const response = await axios.get(fileUrl, { 
                responseType: 'arraybuffer',
                timeout: 10000, // 10 seconds timeout for downloads
            });
            const buffer = Buffer.from(response.data);

            if (!buffer || buffer.length === 0) {
                throw new Error('Downloaded buffer is empty');
            }

            console.log(`[Media]: Processing ${Math.round(buffer.length / 1024)}KB image...`);
            
            // Resize and compress image to optimize for AI processing
            const processedBuffer = await sharp(buffer)
                .resize({ width: 512, height: 512, fit: 'inside' })
                .toFormat('jpeg', { quality: 70 })
                .toBuffer();

            const base64 = processedBuffer.toString('base64');
            console.log(`[Media]: Ready — ${Math.round(base64.length / 1024)}KB base64`);
            return base64;
        } catch (error: any) {
            if (error.code === 'ECONNABORTED') {
                console.error('[Media Timeout]: Failed to download image within 10s.');
            } else {
                console.error('[Media Error]:', error.message);
            }
            throw error;
        }
    }

    /**
     * Downloads a Custom Emoji (Reaction) sticker as Base64.
     */
    async getCustomEmojiBase64(customEmojiId: string): Promise<string | null> {
        try {
            const stickers = await this.api.getCustomEmojiStickers([customEmojiId]);
            if (stickers.length > 0) {
                return await this.downloadAsBase64(stickers[0].file_id);
            }
            return null;
        } catch (error: any) {
            console.error('[Media Emoji Error]:', error.message);
            return null;
        }
    }
}
