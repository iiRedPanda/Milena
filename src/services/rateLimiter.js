class RateLimiter {
    constructor(maxTokens, refillTimeMs) {
        this.maxTokens = maxTokens;
        this.refillTimeMs = refillTimeMs;
        this.tokens = maxTokens;
        this.lastRefill = Date.now();
        this.waitQueue = [];
    }

    async waitForToken() {
        this.refillTokens();

        if (this.tokens > 0) {
            this.tokens--;
            return;
        }

        // If no tokens available, wait in queue
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const index = this.waitQueue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.waitQueue.splice(index, 1);
                    reject(new Error('Rate limit wait timeout'));
                }
            }, 30000); // 30 second timeout

            this.waitQueue.push({
                resolve: () => {
                    clearTimeout(timeout);
                    this.tokens--;
                    resolve();
                },
                timestamp: Date.now()
            });
        });
    }

    releaseToken() {
        this.tokens = Math.min(this.tokens + 1, this.maxTokens);
        this.processQueue();
    }

    refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = Math.floor(timePassed / this.refillTimeMs);

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
            this.lastRefill = now;
            this.processQueue();
        }
    }

    processQueue() {
        while (this.waitQueue.length > 0 && this.tokens > 0) {
            const next = this.waitQueue.shift();
            next.resolve();
        }
    }

    getMetrics() {
        return {
            availableTokens: this.tokens,
            maxTokens: this.maxTokens,
            queueLength: this.waitQueue.length,
            refillTimeMs: this.refillTimeMs,
            timeSinceLastRefill: Date.now() - this.lastRefill
        };
    }
}

export { RateLimiter };
