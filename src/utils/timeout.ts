/**
 * Wraps any Promise with a timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`[Timeout]: ${label} did not respond within ${ms}ms`)), ms)
        )
    ]);
}
