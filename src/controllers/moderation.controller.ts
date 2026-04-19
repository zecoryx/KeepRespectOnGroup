import { Bot } from 'grammy';
import NodeCache from 'node-cache';
import { AIService } from '../services/ai.service.js';
import { MediaHelper } from '../utils/media.helper.js';
import { GuardService } from '../services/guard.service.js';
import { PersistentCache } from '../utils/cache.js';
import { withTimeout } from '../utils/timeout.js';

export class ModerationController {
    constructor(
        private bot: Bot,
        private aiService: AIService,
        private mediaHelper: MediaHelper,
        private guardService: GuardService,
        private scanCache: NodeCache,
        public userCache: PersistentCache
    ) {}

    /**
     * Scans an image/media and applies necessary moderation actions.
     */
    async handleMediaScanning(chatId: number, messageId: number, fromId: number, fileId: string, fileUniqueId: string) {
        const cachedResult = this.scanCache.get(fileUniqueId);
        if (cachedResult === 'NSFW') {
            try { await this.bot.api.deleteMessage(chatId, messageId); } catch {}
            return;
        }
        if (cachedResult === 'SAFE') return;

        try {
            const base64 = await this.mediaHelper.downloadAsBase64(fileId);
            const aiStatus = await this.aiService.analyzeNSFW(base64);

            if (aiStatus === 'YES') {
                this.scanCache.set(fileUniqueId, 'NSFW');
                try { await this.guardService.deleteMessage(chatId, messageId); } catch {}
                await this.guardService.banUser(chatId, fromId, '18+ media detected');
            } else if (aiStatus === 'NO') {
                this.scanCache.set(fileUniqueId, 'SAFE');
            }
            // If ERROR (blind API), do nothing. Do not cache so it can be retried.
        } catch (error) {
            console.error('[Scan Error]:', (error as Error).message);
        }
    }

    /**
     * Verifies if a user is an Admin or Owner (includes 5s timeout).
     */
    async isAdminOrOwner(chatId: number, userId: number): Promise<boolean> {
        try {
            const member = await withTimeout(
                this.bot.api.getChatMember(chatId, userId),
                5000,
                'getChatMember'
            );
            return member.status === 'creator' || member.status === 'administrator';
        } catch {
            return false;
        }
    }

    /**
     * Scans user profile photo (with Persistent Cache + Admin Skip + Timeout).
     */
    async checkUserProfile(userId: number, chatId: number): Promise<boolean> {
        const cacheKey = `${chatId}:${userId}`;

        if (this.userCache.has(cacheKey)) return false;

        // Skip bot's own profile
        if (userId === this.bot.botInfo.id) {
            this.userCache.set(cacheKey, 'SAFE');
            return false;
        }

        const admin = await this.isAdminOrOwner(chatId, userId);
        if (admin) {
            this.userCache.set(cacheKey, 'SAFE');
            console.log(`[User Check]: User ${userId} is admin/owner — skipped.`);
            return false;
        }

        console.log(`[User Check]: Scanning profile of user ${userId} in chat ${chatId}...`);

        try {
            const photos = await withTimeout(
                this.bot.api.getUserProfilePhotos(userId, { limit: 1 }),
                5000,
                'getUserProfilePhotos'
            );

            if (photos.total_count === 0) {
                this.userCache.set(cacheKey, 'SAFE');
                console.log(`[User Check]: User ${userId} no photo — skipped.`);
                return false;
            }

            const photoSizes = photos.photos[0];
            const photo = photoSizes[photoSizes.length - 1];
            if (!photo) {
                this.userCache.set(cacheKey, 'SAFE');
                return false;
            }

            const base64 = await this.mediaHelper.downloadAsBase64(photo.file_id);
            const aiStatus = await this.aiService.analyzeNSFW(base64);

            if (aiStatus === 'YES') {
                console.log(`[User Check]: User ${userId} NSFW profile. Banning...`);
                await this.guardService.banUser(chatId, userId, 'NSFW Profile Photo');
                this.userCache.set(cacheKey, 'NSFW');
                return true;
            } else if (aiStatus === 'NO') {
                this.userCache.set(cacheKey, 'SAFE');
                console.log(`[User Check]: User ${userId} safe.`);
            }

        } catch (error) {
            console.error('[Profile Check Error]:', (error as Error).message);
        }
        return false;
    }
}
