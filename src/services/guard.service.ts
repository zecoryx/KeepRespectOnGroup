import { Api } from 'grammy';

export class GuardService {
    private api: Api;

    constructor(token: string) {
        this.api = new Api(token);
    }

    /**
     * Bans a user from the specific chat.
     */
    async banUser(chatId: number, userId: number, reason: string) {
        try {
            await this.api.banChatMember(chatId, userId);
            console.log(`[Guard]: User ${userId} banned in ${chatId}. Reason: ${reason}`);
            
            // Send a public notification
            await this.api.sendMessage(chatId, `🚫 User has been banned.\nReason: 18+ content (Detected by AI).`);
        } catch (error) {
            console.error('[Guard Ban Error]:', error);
        }
    }

    /**
     * Deletes a specific message.
     */
    async deleteMessage(chatId: number, messageId: number) {
        try {
            await this.api.deleteMessage(chatId, messageId);
            console.log(`[Guard]: Message ${messageId} deleted in ${chatId}.`);
        } catch (error) {
            console.error('[Guard Delete Error]:', error);
        }
    }
}
