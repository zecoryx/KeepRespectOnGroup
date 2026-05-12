/**
 * Global Constants
 */
export const STATUS = {
    SAFE: 'SAFE' as const,
    NSFW: 'NSFW' as const,
    ERROR: 'ERROR' as const,
    YES: 'YES' as const,
    NO: 'NO' as const,
};

export const TTL = {
    SAFE: 30 * 24 * 60 * 60 * 1000, // 30 days
    NSFW: 90 * 24 * 60 * 60 * 1000, // 90 days
};

export const BOT_MESSAGES = {
    BAN_REASON_MEDIA: '18+ media detected',
    BAN_REASON_PROFILE: 'NSFW Profile Photo',
    BAN_REASON_REACTION: 'NSFW Reaction recognized',
    UNAUTHORIZED: '❌ This command is restricted to admins.',
    OWNER_ONLY: '❌ This command is for the bot owner only.',
    GROUP_ONLY: '❌ This command can only be used in a group.',
};

export const LIMITS = {
    MAX_FILE_SIZE: 20 * 1024 * 1024,
    MAX_QUEUE_SIZE: 50,
    MAX_CONCURRENT_AI: 2,
    TIMEOUT_TELEGRAM: 5000,
    TIMEOUT_DOWNLOAD: 10000,
};
