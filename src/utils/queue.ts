/**
 * Request Queue - Limits concurrent asynchronous operations.
 */
export class RequestQueue {
    private running = 0;
    private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
    private maxQueueSize: number;

    constructor(private maxConcurrent: number, maxQueueSize: number = 100) {
        this.maxQueueSize = maxQueueSize;
    }

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }
        
        // Hardened: Prevent DoS by rejecting requests when the queue is too large
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Queue Limit Exceeded: System is overloaded.');
        }

        return new Promise<void>((resolve, reject) => {
            this.queue.push({ resolve: () => {
                this.running++;
                resolve();
            }, reject });
        });
    }

    release(): void {
        this.running--;
        if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next.resolve();
        }
    }

    get pending() { return this.queue.length; }
    get active() { return this.running; }
}
