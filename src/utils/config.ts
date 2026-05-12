import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized Configuration Wrapper
 * Validates and exports environment variables.
 */
export const CONFIG = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    OWNER_ID: parseInt(process.env.OWNER_ID || '0', 10),
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    GOOGLE_API_KEY2: process.env.GOOGLE_API_KEY2 || '',
    DATA_DIR: './data',
    CACHE_FILE: './data/user_cache.json',
};

// Guard: Ensure critical keys are present
if (!CONFIG.BOT_TOKEN) {
    throw new Error('[Config Error]: BOT_TOKEN is missing from environment variables.');
}

if (!CONFIG.GOOGLE_API_KEY) {
    console.warn('[Config Warning]: GOOGLE_API_KEY is not set. AI features will be disabled.');
}
