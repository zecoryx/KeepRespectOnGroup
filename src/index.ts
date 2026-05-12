import { Bot, InlineKeyboard } from 'grammy';
import NodeCache from 'node-cache';
import { CONFIG } from './utils/config.js';
import { AIService } from './services/ai.service.js';
import { MediaHelper } from './utils/media.helper.js';
import { GuardService } from './services/guard.service.js';
import { PersistentCache } from './utils/cache.js';
import { ModerationController } from './controllers/moderation.controller.js';
import { BOT_MESSAGES } from './utils/constants.js';

// Initialization
const bot = new Bot(CONFIG.BOT_TOKEN);
const aiService = new AIService();
const mediaHelper = new MediaHelper(CONFIG.BOT_TOKEN);
const guardService = new GuardService(CONFIG.BOT_TOKEN);
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

// ==========================================
// BOT LISTENERS
// ==========================================

bot.on('message:photo', async (ctx) => {
    if (!ctx.chat || !ctx.from || !ctx.message?.photo) return;
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    await modController.handleMediaScanning(ctx.chat.id, ctx.message.message_id, ctx.from.id, photo.file_id, photo.file_unique_id);
});

bot.on('message:sticker', async (ctx) => {
    if (!ctx.chat || !ctx.from || !ctx.message?.sticker) return;
    const sticker = ctx.message.sticker;
    if (!sticker.is_animated && !sticker.is_video) {
        await modController.handleMediaScanning(ctx.chat.id, ctx.message.message_id, ctx.from.id, sticker.file_id, sticker.file_unique_id);
    }
});

bot.on('message_reaction', async (ctx) => {
    await modController.handleReaction(ctx);
});

bot.on('message', async (ctx, next) => {
    if (ctx.from && ctx.chat && ctx.chat.type !== 'private') {
        const isBanned = await modController.checkUserProfile(ctx.from.id, ctx.chat.id);
        if (isBanned) return;
    }
    await next();
});

bot.on('chat_member', async (ctx) => {
    if (!ctx.chat || !ctx.update.chat_member) return;
    const update = ctx.update.chat_member;
    if (update.new_chat_member.status === 'member' && update.old_chat_member.status !== 'member') {
        await modController.checkUserProfile(update.new_chat_member.user.id, ctx.chat.id);
    }
});

bot.on('chat_join_request', async (ctx) => {
    if (!ctx.update.chat_join_request) return;
    const { from, chat } = ctx.update.chat_join_request;
    const isNSFW = await modController.checkUserProfile(from.id, chat.id);
    if (isNSFW) {
        try { await bot.api.declineChatJoinRequest(chat.id, from.id); } catch {}
    }
});

// ==========================================
// COMMANDS
// ==========================================

bot.command('start', async (ctx) => {
    const botInfo = await bot.api.getMe();
    const welcomeText =
        `👋 **Hello! I am ${botInfo.first_name}**\n\n` +
        `🛡️ AI-powered moderation for NSFW protection.\n\n` +
        `⚙️ **Admin Commands:**\n` +
        `• /unban <id>\n` +
        `• /clear_cache\n` +
        `• /stats\n\n` +
        `🚀 Add me as Admin with 'Ban users' rights.`;

    const keyboard = new InlineKeyboard()
        .url('➕ Add to Group', `https://t.me/${botInfo.username}?startgroup=true&admin=post_messages+delete_messages+restrict_members`)
        .row()
        .url('👨‍💻 Developer', 'https://t.me/zecoryx');

    await ctx.reply(welcomeText, { parse_mode: 'Markdown', reply_markup: keyboard });
});

bot.command('clear_cache', async (ctx) => {
    if (!ctx.from) return;

    if (ctx.chat.type === 'private') {
        if (ctx.from.id !== CONFIG.OWNER_ID) {
            return ctx.reply(BOT_MESSAGES.OWNER_ONLY);
        }
        scanCache.flushAll();
        userCache.flushAll();
        return ctx.reply('✅ Global cache cleared.');
    }

    const isAdmin = await modController.isAdminOrOwner(ctx.chat.id, ctx.from.id);
    if (!isAdmin) return ctx.reply(BOT_MESSAGES.UNAUTHORIZED);

    userCache.clearGroup(ctx.chat.id.toString());
    await ctx.reply('✅ Group cache cleared.');
});

bot.command('unban', async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply(BOT_MESSAGES.GROUP_ONLY);
    
    const isAdmin = await modController.isAdminOrOwner(ctx.chat.id, ctx.from.id!);
    if (!isAdmin) return ctx.reply(BOT_MESSAGES.UNAUTHORIZED);

    const args = ctx.message?.text?.split(' ');
    const targetId = args?.[1] ? Number(args[1]) : null;

    if (!targetId || !Number.isInteger(targetId)) {
        return ctx.reply('❌ Usage: /unban <user_id>');
    }

    await guardService.unbanUser(ctx.chat.id, targetId);
    userCache.delete(`${ctx.chat.id}:${targetId}`);
    await ctx.reply(`✅ User ${targetId} unbanned.`);
});

bot.command('stats', async (ctx) => {
    if (ctx.chat.type !== 'private') {
        const isAdmin = await modController.isAdminOrOwner(ctx.chat.id, ctx.from!.id);
        if (!isAdmin) return ctx.reply(BOT_MESSAGES.UNAUTHORIZED);
    }

    const stats = scanCache.getStats();
    await ctx.reply(`📊 **Stats**\n\n👤 Users: ${userCache.keys().length}\n🖼️ Media: ${stats.keys}`);
});

bot.catch((err) => {
    console.error(`[Bot Error]: Internal error on update ${err.ctx.update.update_id}`);
});

bot.start({ allowed_updates: ['message', 'message_reaction', 'chat_member', 'chat_join_request'] });
console.log('KeepRSPCT is running...');
