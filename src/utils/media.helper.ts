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
            const file = await this.api.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 10000 });
            const buffer = Buffer.from(response.data);

            if (!buffer || buffer.length === 0) throw new Error('Downloaded buffer is empty');

            // 224px — enough for AI classification, ~3x fewer image tokens than 512px
            const processedBuffer = await sharp(buffer)
                .resize({ width: 224, height: 224, fit: 'inside' })
                .toFormat('jpeg', { quality: 60 })
                .toBuffer();

            return processedBuffer.toString('base64');
        } catch (error: any) {
            console.error('[Media Error]:', error.message);
            throw error;
        }
    }

    /**
     * Downloads a Custom Emoji (Reaction) sticker as Base64.
     */
    async getCustomEmojiBase64(customEmojiId: string): Promise<string | null> {
        try {
            const stickers = await this.api.getCustomEmojiStickers([customEmojiId]);
            if (stickers.length > 0) return await this.downloadAsBase64(stickers[0].file_id);
            return null;
        } catch (error: any) {
            console.error('[Media Emoji Error]:', error.message);
            return null;
        }
    }
}
