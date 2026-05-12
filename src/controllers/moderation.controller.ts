import { Bot, Context } from 'grammy';
import NodeCache from 'node-cache';
import { AIService } from '../services/ai.service.js';
import { MediaHelper } from '../utils/media.helper.js';
import { GuardService } from '../services/guard.service.js';
import { PersistentCache } from '../utils/cache.js';
import { withTimeout } from '../utils/timeout.js';
import { STATUS, BOT_MESSAGES, LIMITS } from '../utils/constants.js';

export class ModerationController {
    private inFlightChecks: Map<string, Promise<boolean>> = new Map();

    constructor(
        private bot: Bot,
        private aiService: AIService,
        private mediaHelper: MediaHelper,
        private guardService: GuardService,
        private scanCache: NodeCache,
        public userCache: PersistentCache
    ) {}

    /**
     * Entry point for image/sticker scanning updates.
     */
    async handleMediaScanning(chatId: number, messageId: number, fromId: number, fileId: string, fileUniqueId: string) {
        const cached = this.scanCache.get(fileUniqueId);
        if (cached === STATUS.NSFW) {
            return this.guardService.deleteMessage(chatId, messageId).catch(() => {});
        }
        if (cached === STATUS.SAFE) return;

        try {
            const base64 = await this.mediaHelper.downloadAsBase64(fileId);
            const result = await this.aiService.analyzeNSFW(base64);

            if (result === STATUS.YES) {
                this.scanCache.set(fileUniqueId, STATUS.NSFW);
                await Promise.all([
                    this.guardService.deleteMessage(chatId, messageId),
                    this.guardService.banUser(chatId, fromId, BOT_MESSAGES.BAN_REASON_MEDIA)
                ]);
            } else if (result === STATUS.NO) {
                this.scanCache.set(fileUniqueId, STATUS.SAFE);
            }
        } catch (e) {
            console.error('[Controller]: Media scan failed.');
        }
    }

    /**
     * Handles reaction updates specifically looking for custom emojis.
     */
    async handleReaction(ctx: Context) {
        if (!ctx.from || !ctx.chat || !ctx.update.message_reaction) return;
        
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const reactions = ctx.update.message_reaction.new_reaction || [];

        for (const reaction of reactions) {
            if (reaction.type !== 'custom_emoji') continue;
            
            const emojiId = (reaction as any).custom_emoji_id;
            const cached = this.scanCache.get(emojiId);

            if (cached === STATUS.NSFW) {
                return this.guardService.banUser(chatId, userId, BOT_MESSAGES.BAN_REASON_REACTION);
            }
            if (cached === STATUS.SAFE) continue;

            const base64 = await this.mediaHelper.getCustomEmojiBase64(emojiId);
            if (!base64) continue;

            const result = await this.aiService.analyzeNSFW(base64);
            if (result === STATUS.YES) {
                this.scanCache.set(emojiId, STATUS.NSFW);
                await this.guardService.banUser(chatId, userId, BOT_MESSAGES.BAN_REASON_REACTION);
            } else {
                this.scanCache.set(emojiId, STATUS.SAFE);
            }
        }
    }

    async isAdminOrOwner(chatId: number, userId: number): Promise<boolean> {
        try {
            const member = await withTimeout(
                this.bot.api.getChatMember(chatId, userId),
                LIMITS.TIMEOUT_TELEGRAM,
                'getChatMember'
            );
            return member.status === 'creator' || member.status === 'administrator';
        } catch {
            return false;
        }
    }

    async checkUserProfile(userId: number, chatId: number): Promise<boolean> {
        const key = `${chatId}:${userId}`;
        const cached = this.userCache.get(key);
        if (cached) return cached === STATUS.NSFW;

        if (this.inFlightChecks.has(key)) return this.inFlightChecks.get(key)!;

        const promise = this.performProfileCheck(userId, chatId, key);
        this.inFlightChecks.set(key, promise);
        try { return await promise; } finally { this.inFlightChecks.delete(key); }
    }

    private async performProfileCheck(userId: number, chatId: number, key: string): Promise<boolean> {
        if (userId === this.bot.botInfo.id) return false;

        const isAdmin = await this.isAdminOrOwner(chatId, userId);
        if (isAdmin) {
            this.userCache.set(key, STATUS.SAFE);
            return false;
        }

        try {
            const photos = await this.bot.api.getUserProfilePhotos(userId, { limit: 1 });
            if (photos.total_count === 0) {
                this.userCache.set(key, STATUS.SAFE);
                return false;
            }

            const photo = photos.photos[0][photos.photos[0].length - 1];
            const base64 = await this.mediaHelper.downloadAsBase64(photo.file_id);
            const result = await this.aiService.analyzeNSFW(base64);

            if (result === STATUS.YES) {
                this.guardService.banUser(chatId, userId, BOT_MESSAGES.BAN_REASON_PROFILE).catch(() => {});
                this.userCache.set(key, STATUS.NSFW);
                return true;
            }
            this.userCache.set(key, STATUS.SAFE);
        } catch {
            console.error('[Controller]: Profile check failed.');
        }
        return false;
    }
}
