import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'user_cache.json');

interface CacheEntry {
    status: 'SAFE' | 'NSFW';
    timestamp: number;
}

const SAFE_TTL = 30 * 24 * 60 * 60 * 1000;
const NSFW_TTL = 90 * 24 * 60 * 60 * 1000;

function ttlFor(status: 'SAFE' | 'NSFW'): number {
    return status === 'NSFW' ? NSFW_TTL : SAFE_TTL;
}

export class PersistentCache {
    private cache: Record<string, CacheEntry> = {};
    private saveTimeout: NodeJS.Timeout | null = null;
    private isSaving: boolean = false;
    private hasPendingSave: boolean = false;

    constructor() {
        this.loadSync();
    }

    private loadSync(): void {
        try {
            if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
            if (existsSync(CACHE_FILE)) {
                this.cache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
                this.cleanup();
            }
        } catch (error) {
            console.error('[Cache Load Error]: Corrupted cache or permission denied. Starting fresh.');
            this.cache = {};
        }
    }

    /**
     * Hardened: Safe async state machine to prevent data loss or file corruption on overlapping writes.
     */
    private triggerSave(): void {
        if (this.saveTimeout) return;
        this.saveTimeout = setTimeout(async () => {
            this.saveTimeout = null;
            
            if (this.isSaving) {
                this.hasPendingSave = true;
                return;
            }
            
            this.isSaving = true;
            try {
                // Use a temporary file and rename to prevent corruption on crash
                const tempFile = `${CACHE_FILE}.tmp`;
                await fs.writeFile(tempFile, JSON.stringify(this.cache, null, 2), 'utf-8');
                await fs.rename(tempFile, CACHE_FILE);
            } catch (error) {
                console.error('[Cache Save Error]: Failed to persist cache to disk.');
            } finally {
                this.isSaving = false;
                if (this.hasPendingSave) {
                    this.hasPendingSave = false;
                    this.triggerSave();
                }
            }
        }, 1000);
    }

    private cleanup(): void {
        const now = Date.now();
        let removed = 0;
        for (const key of Object.keys(this.cache)) {
            const entry = this.cache[key];
            if (now - entry.timestamp > ttlFor(entry.status)) {
                delete this.cache[key];
                removed++;
            }
        }
        if (removed > 0) this.triggerSave();
    }

    has(key: string): boolean {
        const entry = this.cache[key];
        if (!entry) return false;
        if (Date.now() - entry.timestamp > ttlFor(entry.status)) {
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

    delete(key: string): void {
        if (this.cache[key]) {
            delete this.cache[key];
            this.triggerSave();
        }
    }

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

    flushAll(): void {
        this.cache = {};
        this.triggerSave();
    }

    keys(): string[] {
        return Object.keys(this.cache);
    }
}
