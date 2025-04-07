import logger from './logger.js';
import { RateLimiter } from './rateLimiter.js';
import analytics from './analytics.js';

class ResourcePool {
    constructor(name, maxConcurrent, cooldownMs) {
        this.name = name;
        this.maxConcurrent = maxConcurrent;
        this.cooldownMs = cooldownMs;
        this.active = 0;
        this.queue = [];
        this.rateLimiter = new RateLimiter(maxConcurrent, cooldownMs);
    }

    async acquire() {
        await this.rateLimiter.waitForToken();
        this.active++;
        analytics.trackResourceUsage(this.name, 'acquire');
    }

    release() {
        this.active--;
        this.rateLimiter.releaseToken();
        analytics.trackResourceUsage(this.name, 'release');
        this.processQueue();
    }

    async processQueue() {
        if (this.queue.length > 0 && this.active < this.maxConcurrent) {
            const next = this.queue.shift();
            await this.acquire();
            next.resolve();
        }
    }

    async waitForResource() {
        if (this.active < this.maxConcurrent) {
            await this.acquire();
            return;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const index = this.queue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    reject(new Error('Resource wait timeout'));
                }
            }, 30000); // 30 second timeout

            this.queue.push({
                resolve: () => {
                    clearTimeout(timeout);
                    resolve();
                },
                timestamp: Date.now()
            });
        });
    }
}

class Cache {
    constructor(maxSize = 1000, ttlMs = 3600000) { // 1 hour default TTL
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
        this.setupCleanup();
    }

    set(key, value, customTtlMs) {
        // If cache is full, remove oldest entries
        if (this.cache.size >= this.maxSize) {
            const entries = Array.from(this.cache.entries());
            const oldestEntries = entries
                .sort(([, a], [, b]) => a.timestamp - b.timestamp)
                .slice(0, Math.ceil(this.maxSize * 0.2)); // Remove 20% of oldest entries

            for (const [key] of oldestEntries) {
                this.cache.delete(key);
            }
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl: customTtlMs || this.ttlMs
        });
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if entry has expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    setupCleanup() {
        // Cleanup expired entries every minute
        setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.cache.entries()) {
                if (now - entry.timestamp > entry.ttl) {
                    this.cache.delete(key);
                }
            }
        }, 60000);
    }
}

class ResourceManager {
    constructor() {
        // Initialize resource pools
        this.pools = {
            AI_HIGH: new ResourcePool('AI_HIGH', 2, 1000),    // 2 concurrent, 1s cooldown
            AI_NORMAL: new ResourcePool('AI_NORMAL', 5, 2000), // 5 concurrent, 2s cooldown
            AI_LOW: new ResourcePool('AI_LOW', 10, 5000),     // 10 concurrent, 5s cooldown
            GAME: new ResourcePool('GAME', 20, 500),          // 20 concurrent, 0.5s cooldown
            DB: new ResourcePool('DB', 50, 100)               // 50 concurrent, 0.1s cooldown
        };

        // Initialize caches
        this.caches = {
            AI_RESPONSES: new Cache(500, 3600000),     // 500 entries, 1 hour TTL
            GAME_DATA: new Cache(1000, 1800000),       // 1000 entries, 30 min TTL
            USER_DATA: new Cache(5000, 300000)         // 5000 entries, 5 min TTL
        };

        this.setupMetrics();
    }

    setupMetrics() {
        setInterval(() => {
            // Log resource pool metrics
            for (const [name, pool] of Object.entries(this.pools)) {
                logger.log('info', 'Resource pool metrics', {
                    pool: name,
                    active: pool.active,
                    queueLength: pool.queue.length
                });
            }

            // Log cache metrics
            for (const [name, cache] of Object.entries(this.caches)) {
                logger.log('info', 'Cache metrics', {
                    cache: name,
                    size: cache.cache.size,
                    maxSize: cache.maxSize
                });
            }
        }, 300000); // Every 5 minutes
    }

    async request(poolName, operation, options = {}) {
        const {
            timeout = 30000,
            priority = 'normal',
            cacheKey = null,
            cacheTtl = null
        } = options;

        const pool = this.pools[poolName];
        if (!pool) {
            throw new Error(`Unknown resource pool: ${poolName}`);
        }

        // Check cache if cacheKey provided
        const cache = this.caches[poolName];
        if (cacheKey && cache) {
            const cachedResult = cache.get(cacheKey);
            if (cachedResult) {
                analytics.trackResourceUsage(poolName, 'cache_hit');
                return cachedResult;
            }
        }

        // Set up timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Operation timed out')), timeout);
        });

        try {
            // Wait for resource and execute operation
            await pool.waitForResource();
            const startTime = Date.now();

            const result = await Promise.race([
                operation(),
                timeoutPromise
            ]);

            // Cache result if cacheKey provided
            if (cacheKey && cache && result) {
                cache.set(cacheKey, result, cacheTtl);
            }

            // Track metrics
            analytics.trackResourceUsage(poolName, 'success', Date.now() - startTime);

            return result;
        } catch (error) {
            analytics.trackResourceUsage(poolName, 'error');
            throw error;
        } finally {
            pool.release();
        }
    }

    clearCache(poolName) {
        const cache = this.caches[poolName];
        if (cache) {
            cache.cache.clear();
            logger.log('info', `Cleared cache for ${poolName}`);
        }
    }

    getMetrics() {
        const metrics = {
            pools: {},
            caches: {}
        };

        // Collect pool metrics
        for (const [name, pool] of Object.entries(this.pools)) {
            metrics.pools[name] = {
                active: pool.active,
                queueLength: pool.queue.length,
                maxConcurrent: pool.maxConcurrent,
                cooldownMs: pool.cooldownMs
            };
        }

        // Collect cache metrics
        for (const [name, cache] of Object.entries(this.caches)) {
            metrics.caches[name] = {
                size: cache.cache.size,
                maxSize: cache.maxSize,
                ttlMs: cache.ttlMs
            };
        }

        return metrics;
    }
}

export default new ResourceManager();
