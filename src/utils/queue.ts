/**
 * Request Queue - Limits concurrent asynchronous operations.
 */
export class RequestQueue {
    private running = 0;
    private queue: Array<() => void> = [];

    constructor(private maxConcurrent: number) {}

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }
        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
        }
    }

    get pending() { return this.queue.length; }
    get active() { return this.running; }
}
