import logger from './logger.js';

class CacheManager {
    constructor() {
        this.caches = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Create a new cache with specified options
     * @param {string} name - Cache name
     * @param {Object} options - Cache configuration
     */
    createCache(name, options = {}) {
        const defaultOptions = {
            maxSize: 1000,
            ttl: 3600000, // 1 hour
            updateAgeOnGet: true,
            evictionPolicy: 'lru', // 'lru' or 'fifo'
        };

        const cache = {
            name,
            options: { ...defaultOptions, ...options },
            items: new Map(),
            stats: {
                hits: 0,
                misses: 0,
                evictions: 0
            }
        };

        this.caches.set(name, cache);
        logger.log('info', `Created cache: ${name}`, { options: cache.options });
    }

    /**
     * Get an item from cache
     * @param {string} cacheName - Cache name
     * @param {string} key - Item key
     * @returns {*} Cached value or null
     */
    get(cacheName, key) {
        const cache = this.caches.get(cacheName);
        if (!cache) {
            logger.log('warn', `Cache not found: ${cacheName}`);
            return null;
        }

        const item = cache.items.get(key);
        if (!item) {
            cache.stats.misses++;
            this.stats.misses++;
            return null;
        }

        // Check if item has expired
        if (Date.now() > item.expiresAt) {
            cache.items.delete(key);
            cache.stats.evictions++;
            this.stats.evictions++;
            return null;
        }

        // Update access time for LRU
        if (cache.options.updateAgeOnGet) {
            item.lastAccessed = Date.now();
        }

        cache.stats.hits++;
        this.stats.hits++;
        return item.value;
    }

    /**
     * Set an item in cache
     * @param {string} cacheName - Cache name
     * @param {string} key - Item key
     * @param {*} value - Value to cache
     * @param {number} [ttl] - Optional TTL override
     */
    set(cacheName, key, value, ttl = null) {
        const cache = this.caches.get(cacheName);
        if (!cache) {
            logger.log('warn', `Cache not found: ${cacheName}`);
            return;
        }

        // Check cache size and evict if necessary
        if (cache.items.size >= cache.options.maxSize) {
            this.evict(cache);
        }

        const now = Date.now();
        cache.items.set(key, {
            value,
            created: now,
            lastAccessed: now,
            expiresAt: now + (ttl || cache.options.ttl)
        });
    }

    /**
     * Evict items based on policy
     * @param {Object} cache - Cache object
     */
    evict(cache) {
        if (cache.options.evictionPolicy === 'lru') {
            // Find least recently used item
            let oldestAccess = Infinity;
            let oldestKey = null;

            for (const [key, item] of cache.items.entries()) {
                if (item.lastAccessed < oldestAccess) {
                    oldestAccess = item.lastAccessed;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                cache.items.delete(oldestKey);
                cache.stats.evictions++;
                this.stats.evictions++;
            }
        } else {
            // FIFO: remove oldest item by creation time
            let oldestCreation = Infinity;
            let oldestKey = null;

            for (const [key, item] of cache.items.entries()) {
                if (item.created < oldestCreation) {
                    oldestCreation = item.created;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                cache.items.delete(oldestKey);
                cache.stats.evictions++;
                this.stats.evictions++;
            }
        }
    }

    /**
     * Clear a specific cache or all caches
     * @param {string} [cacheName] - Optional cache name
     */
    clear(cacheName = null) {
        if (cacheName) {
            const cache = this.caches.get(cacheName);
            if (cache) {
                cache.items.clear();
                logger.log('info', `Cleared cache: ${cacheName}`);
            }
        } else {
            for (const cache of this.caches.values()) {
                cache.items.clear();
            }
            logger.log('info', 'Cleared all caches');
        }
    }

    /**
     * Get cache statistics
     * @param {string} [cacheName] - Optional cache name
     * @returns {Object} Cache statistics
     */
    getStats(cacheName = null) {
        if (cacheName) {
            const cache = this.caches.get(cacheName);
            if (!cache) return null;

            return {
                name: cache.name,
                size: cache.items.size,
                maxSize: cache.options.maxSize,
                ttl: cache.options.ttl,
                stats: { ...cache.stats },
                hitRate: cache.stats.hits / (cache.stats.hits + cache.stats.misses) || 0
            };
        }

        const globalStats = {
            caches: {},
            total: { ...this.stats },
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };

        for (const [name, cache] of this.caches.entries()) {
            globalStats.caches[name] = {
                size: cache.items.size,
                maxSize: cache.options.maxSize,
                stats: { ...cache.stats },
                hitRate: cache.stats.hits / (cache.stats.hits + cache.stats.misses) || 0
            };
        }

        return globalStats;
    }

    /**
     * Start maintenance tasks
     */
    startMaintenance() {
        // Clean up expired items every minute
        setInterval(() => {
            const now = Date.now();
            for (const cache of this.caches.values()) {
                for (const [key, item] of cache.items.entries()) {
                    if (now > item.expiresAt) {
                        cache.items.delete(key);
                        cache.stats.evictions++;
                        this.stats.evictions++;
                    }
                }
            }
        }, 60000);

        // Log cache statistics every 5 minutes
        setInterval(() => {
            logger.log('info', 'Cache statistics', this.getStats());
        }, 300000);
    }
}

export default new CacheManager();
