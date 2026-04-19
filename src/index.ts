import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';
import { AIService } from './services/ai.service.js';
import { MediaHelper } from './utils/media.helper.js';
import { GuardService } from './services/guard.service.js';
import { PersistentCache } from './utils/cache.js';
import { ModerationController } from './controllers/moderation.controller.js';

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is missing!');

// Initialization
const bot = new Bot(token);
const aiService = new AIService();
const mediaHelper = new MediaHelper(token);
const guardService = new GuardService(token);
const scanCache = new NodeCache({ stdTTL: 86400 });
const userCache = new PersistentCache();

const modController = new ModerationController(
    bot,
    aiService,
    mediaHelper,
    guardService,
    scanCache,
    userCache
);

console.log('[Setup]: Services & Controllers initialized.');

// ==========================================
// BOT LISTENERS
// ==========================================

bot.on('message:photo', async (ctx) => {
    if (!ctx.chat || !ctx.from || !ctx.message?.photo) return;
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];
    if (photo) {
        await modController.handleMediaScanning(ctx.chat.id, ctx.message.message_id, ctx.from.id, photo.file_id, photo.file_unique_id);
    }
});

bot.on('message:sticker', async (ctx) => {
    if (!ctx.chat || !ctx.from || !ctx.message?.sticker) return;
    const sticker = ctx.message.sticker;
    if (!sticker.is_animated && !sticker.is_video) {
        await modController.handleMediaScanning(ctx.chat.id, ctx.message.message_id, ctx.from.id, sticker.file_id, sticker.file_unique_id);
    }
});

bot.on('message_reaction', async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    const isBanned = await modController.checkUserProfile(userId, chatId);
    if (isBanned) return;

    const update = ctx.update.message_reaction;
    if (!update) return;
    const reactions = update.new_reaction || [];

    for (const reaction of reactions) {
        if (reaction.type === 'custom_emoji') {
            const emojiId = (reaction as any).custom_emoji_id;
            if (!emojiId) continue;

            const cachedResult = scanCache.get(emojiId);
            if (cachedResult === 'NSFW') {
                await guardService.banUser(chatId, userId, 'NSFW Reaction recognized');
                return;
            }
            if (cachedResult === 'SAFE') continue;

            const base64 = await mediaHelper.getCustomEmojiBase64(emojiId);
            if (base64) {
                const aiStatus = await aiService.analyzeNSFW(base64);
                if (aiStatus === 'YES') {
                    scanCache.set(emojiId, 'NSFW');
                    await guardService.banUser(chatId, userId, 'NSFW Reaction detected');
                } else if (aiStatus === 'NO') {
                    scanCache.set(emojiId, 'SAFE');
                }
            }
        }
    }
});

bot.on('message', async (ctx, next) => {
    if (ctx.from && ctx.chat && ctx.chat.type !== 'private') {
        const isBanned = await modController.checkUserProfile(ctx.from.id, ctx.chat.id);
        if (isBanned) return;
    }
    await next();
});

bot.on('chat_member', async (ctx) => {
    if (!ctx.chat) return;
    const update = ctx.update.chat_member;
    if (!update) return;
    if (update.new_chat_member.status === 'member' && update.old_chat_member.status !== 'member') {
        await modController.checkUserProfile(update.new_chat_member.user.id, ctx.chat.id);
    }
});

bot.on('chat_join_request', async (ctx) => {
    const update = ctx.update.chat_join_request;
    if (!update) return;
    const userId = update.from.id;
    const chatId = update.chat.id;
    const isNSFW = await modController.checkUserProfile(userId, chatId);
    if (isNSFW) {
        try { await bot.api.declineChatJoinRequest(chatId, userId); } catch {}
    }
});

// ==========================================
// COMMANDS
// ==========================================

bot.command('start', async (ctx) => {
    const botInfo = await bot.api.getMe();
    const welcomeText = 
        `👋 **Hello! I am ${botInfo.first_name}**\n\n` +
        `🛡️ I am an AI-powered moderation bot designed to protect your groups from NSFW (18+) content.\n\n` +
        `🔍 **What I can do:**\n` +
        `• Scan profile photos of new members\n` +
        `• Monitor stickers and photos in real-time\n` +
        `• Block NSFW reactions and custom emojis\n\n` +
        `🚀 **To get started:**\n` +
        `1. Press the button below to add me to your group.\n` +
        `2. Grant me **Administrator** rights (Ban users & Delete messages).\n` +
        `3. All set! I will start guarding your community immediately.`;

    const keyboard = new InlineKeyboard()
        .url('➕ Add to Group', `https://t.me/${botInfo.username}?startgroup=true&admin=post_messages+delete_messages+restrict_members`)
        .row()
        .url('👨‍💻 Developer', 'https://t.me/zecoryx');

    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

bot.command('clear_cache', async (ctx) => {
    if (!ctx.from) return;

    if (ctx.chat.type === 'private') {
        scanCache.flushAll();
        modController.userCache.flushAll();
        await ctx.reply('✅ All global caches cleared!');
        return;
    }

    try {
        const admin = await modController.isAdminOrOwner(ctx.chat.id, ctx.from.id);
        if (!admin) {
            await ctx.reply('❌ This command is restricted to admins.');
            return;
        }

        const cleared = modController.userCache.clearGroup(ctx.chat.id.toString());
        await ctx.reply(`✅ Group cache cleared! (${cleared} records removed)`);
    } catch (e) {
        console.error('[Clear Cache Error]:', (e as Error).message);
        await ctx.reply('❌ An error occurred.');
    }
});

bot.command('test', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('⏳ Testing API Connection...');
    const result = await aiService.testConnection();
    await ctx.reply(result);
});

// ==========================================
// ERROR HANDLING & STARTUP
// ==========================================

bot.catch((err) => {
    console.error(`[Bot Error] Update ${err.ctx.update.update_id}: ${err.message}`);
});

bot.start({
    allowed_updates: ['message', 'message_reaction', 'chat_member', 'chat_join_request']
});
console.log('Bot is running securely...');
