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
            console.log(`[Ban]: User ${userId} banned in ${chatId} — ${reason}`);
            await this.api.sendMessage(chatId, `🚫 User has been banned.\nReason: 18+ content (Detected by AI).`);
        } catch (error) {
            console.error('[Ban Error]:', error);
        }
    }

    async unbanUser(chatId: number, userId: number) {
        try {
            await this.api.unbanChatMember(chatId, userId, { only_if_banned: true });
            console.log(`[Unban]: User ${userId} in ${chatId}`);
        } catch (error) {
            console.error('[Unban Error]:', error);
        }
    }

    async deleteMessage(chatId: number, messageId: number) {
        try {
            await this.api.deleteMessage(chatId, messageId);
        } catch (error) {
            console.error('[Delete Error]:', error);
        }
    }
}
