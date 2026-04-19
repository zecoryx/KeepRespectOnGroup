import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'user_cache.json');

interface CacheEntry {
    status: 'SAFE' | 'NSFW';
    timestamp: number;
}

// 7-day TTL (milliseconds)
const TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * File-based persistent cache using non-blocking asynchronous I/O.
 * Data survives bot restarts.
 * Stored per group using "chatId:userId" format.
 */
export class PersistentCache {
    private cache: Record<string, CacheEntry> = {};
    private saveTimeout: NodeJS.Timeout | null = null;

    constructor() {
        this.loadSync();
    }

    /**
     * Initial load is synchronous to ensure cache is ready before bot starts.
     */
    private loadSync(): void {
        try {
            if (!existsSync(DATA_DIR)) {
                mkdirSync(DATA_DIR, { recursive: true });
            }
            if (existsSync(CACHE_FILE)) {
                const raw = readFileSync(CACHE_FILE, 'utf-8');
                this.cache = JSON.parse(raw);
                this.cleanup();
                console.log(`[Cache]: Loaded ${Object.keys(this.cache).length} entries.`);
            } else {
                console.log('[Cache]: New cache file created.');
            }
        } catch (error) {
            console.error('[Cache Load Error]:', error);
            this.cache = {};
        }
    }

    /**
     * Triggers a debounced asynchronous save to disk.
     */
    private triggerSave(): void {
        if (this.saveTimeout) return;

        this.saveTimeout = setTimeout(async () => {
            try {
                const data = JSON.stringify(this.cache, null, 2);
                await fs.writeFile(CACHE_FILE, data, 'utf-8');
                this.saveTimeout = null;
            } catch (error) {
                console.error('[Cache Async Save Error]:', error);
                this.saveTimeout = null;
            }
        }, 1000); // Wait 1 second before saving to batch multiple updates
    }

    /** Clear expired cache entries */
    private cleanup(): void {
        const now = Date.now();
        let removed = 0;
        for (const key of Object.keys(this.cache)) {
            if (now - this.cache[key].timestamp > TTL) {
                delete this.cache[key];
                removed++;
            }
        }
        if (removed > 0) {
            this.triggerSave();
            console.log(`[Cache]: Cleared ${removed} expired entries.`);
        }
    }

    has(key: string): boolean {
        const entry = this.cache[key];
        if (!entry) return false;
        
        // TTL Check
        if (Date.now() - entry.timestamp > TTL) {
            delete this.cache[key];
            this.triggerSave();
            return false;
        }
        return true;
    }

    get(key: string): string | undefined {
        if (!this.has(key)) return undefined;
        return this.cache[key].status;
    }

    set(key: string, status: 'SAFE' | 'NSFW'): void {
        this.cache[key] = { status, timestamp: Date.now() };
        this.triggerSave();
    }

    /** Clear cache for a specific group */
    clearGroup(chatId: string): number {
        let cleared = 0;
        for (const key of Object.keys(this.cache)) {
            if (key.startsWith(chatId + ':')) {
                delete this.cache[key];
                cleared++;
            }
        }
        this.triggerSave();
        return cleared;
    }

    /** Clear all cache entries */
    flushAll(): void {
        this.cache = {};
        this.triggerSave();
    }

    keys(): string[] {
        return Object.keys(this.cache);
    }
}
