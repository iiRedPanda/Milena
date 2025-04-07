import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { log } from '../botLogger.js';
import personality from './personality.js';
import resourceManager from './resourceManager.js';

// Advanced API client with connection pooling, circuit breaker, and load balancing
class GeminiClient {
    constructor(options = {}) {
        this.options = {
            maxRetries: options.maxRetries || 3,
            timeout: options.timeout || 8000,
            circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
            circuitBreakerTimeout: options.circuitBreakerTimeout || 30000,
            maxConcurrent: options.maxConcurrent || 10,
            batchWindow: options.batchWindow || 100, // ms to batch requests
            maxBatchSize: options.maxBatchSize || 5,
            adaptiveTimeout: options.adaptiveTimeout || true,
            minTimeout: options.minTimeout || 3000,
            maxTimeout: options.maxTimeout || 15000,
            ...options
        };

        this.failureCount = 0;
        this.lastFailureTime = null;
        this.circuitOpen = false;
        this.activeRequests = 0;
        this.requestQueue = [];
        this.batchQueue = [];
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            p95ResponseTime: 0,
            responseTimes: []
        };
        
        this.initialize();
    }

    async initialize() {
        try {
            const configPath = path.resolve('config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            this.config = JSON.parse(configData);
            
            this.apiKey = process.env.GEMINI_API_KEY;
            if (!this.apiKey) {
                throw new Error('GEMINI_API_KEY is not set');
            }

            // Initialize axios instance with optimized settings
            this.client = axios.create({
                baseURL: this.config.geminiApiUrl,
                timeout: this.options.timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
                validateStatus: status => status >= 200 && status < 300,
                maxRedirects: 5,
                decompress: true,
                keepAlive: true,
                maxSockets: this.options.maxConcurrent,
                proxy: false
            });

            // Add response interceptor for metrics
            this.client.interceptors.response.use(
                response => {
                    this.recordSuccess(response.config.metadata?.startTime);
                    return response;
                },
                error => {
                    this.recordFailure(error.config?.metadata?.startTime);
                    throw error;
                }
            );

            // Start batch processor
            this.startBatchProcessor();

            log('info', 'Gemini client initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize Gemini client', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    startBatchProcessor() {
        setInterval(() => {
            if (this.batchQueue.length === 0) return;

            // Process batches up to maxBatchSize
            while (this.batchQueue.length > 0) {
                const batch = this.batchQueue.splice(0, this.options.maxBatchSize);
                this.processBatch(batch);
            }
        }, this.options.batchWindow);
    }

    async processBatch(batch) {
        try {
            const responses = await Promise.allSettled(
                batch.map(req => this.executeRequest(req.prompt))
            );

            responses.forEach((response, index) => {
                if (response.status === 'fulfilled') {
                    batch[index].resolve(response.value);
                } else {
                    batch[index].reject(response.reason);
                }
            });
        } catch (error) {
            batch.forEach(req => req.reject(error));
        }
    }

    recordSuccess(startTime) {
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.circuitOpen = false;

        if (startTime) {
            const responseTime = Date.now() - startTime;
            this.updateMetrics(true, responseTime);
        }
    }

    recordFailure(startTime) {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (startTime) {
            const responseTime = Date.now() - startTime;
            this.updateMetrics(false, responseTime);
        }
        
        if (this.failureCount >= this.options.circuitBreakerThreshold) {
            this.circuitOpen = true;
            log('warn', 'Circuit breaker opened', {
                failures: this.failureCount,
                threshold: this.options.circuitBreakerThreshold
            });
        }
    }

    updateMetrics(success, responseTime) {
        this.metrics.totalRequests++;
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }

        // Update response time metrics
        this.metrics.responseTimes.push(responseTime);
        if (this.metrics.responseTimes.length > 100) {
            this.metrics.responseTimes.shift();
        }

        // Calculate average
        this.metrics.avgResponseTime = this.metrics.responseTimes.reduce((a, b) => a + b, 0) / 
            this.metrics.responseTimes.length;

        // Calculate p95
        const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        this.metrics.p95ResponseTime = sorted[p95Index];

        // Adjust timeout based on metrics
        if (this.options.adaptiveTimeout) {
            const newTimeout = this.metrics.p95ResponseTime * 1.5;
            this.options.timeout = Math.min(
                Math.max(this.options.minTimeout, newTimeout),
                this.options.maxTimeout
            );
        }
    }

    async executeRequest(prompt) {
        // Check circuit breaker
        if (this.circuitOpen) {
            if (Date.now() - this.lastFailureTime > this.options.circuitBreakerTimeout) {
                this.circuitOpen = false;
                this.failureCount = 0;
                log('info', 'Circuit breaker reset');
            } else {
                throw new Error('Circuit breaker is open');
            }
        }

        // Check concurrent requests limit
        if (this.activeRequests >= this.options.maxConcurrent) {
            return new Promise((resolve, reject) => {
                this.batchQueue.push({ prompt, resolve, reject });
            });
        }

        let attempt = 0;
        let lastError = null;

        while (attempt < this.options.maxRetries) {
            try {
                this.activeRequests++;
                const startTime = Date.now();

                const response = await this.client.post('/v1/chat/completions', {
                    prompt,
                    max_tokens: 1000,
                    temperature: 0.7,
                    metadata: { startTime }
                }, {
                    headers: { 'Authorization': `Bearer ${this.apiKey}` }
                });

                return response.data;
            } catch (error) {
                attempt++;
                lastError = error;

                if (attempt < this.options.maxRetries) {
                    // Exponential backoff
                    const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }
            } finally {
                this.activeRequests--;
            }
        }

        throw lastError;
    }

    getMetrics() {
        return {
            ...this.metrics,
            circuitBreakerStatus: this.circuitOpen ? 'open' : 'closed',
            activeRequests: this.activeRequests,
            queueLength: this.batchQueue.length,
            currentTimeout: this.options.timeout
        };
    }
}

// Initialize client
const geminiClient = new GeminiClient();

// Advanced response cache with LRU and adaptive TTL
class ResponseCache {
    constructor(options = {}) {
        this.options = {
            maxSize: options.maxSize || 1000,
            baseTTL: options.baseTTL || 5 * 60 * 1000, // 5 minutes
            minTTL: options.minTTL || 60 * 1000, // 1 minute
            maxTTL: options.maxTTL || 30 * 60 * 1000, // 30 minutes
            adaptiveTTL: options.adaptiveTTL || true,
            ...options
        };

        this.cache = new Map();
        this.accessCount = new Map();
        this.hitCount = new Map();
        this.metrics = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    set(key, value) {
        // Evict entries if cache is full
        if (this.cache.size >= this.options.maxSize) {
            this.evictLRU();
        }

        const ttl = this.calculateTTL(key);
        this.cache.set(key, {
            value,
            expires: Date.now() + ttl,
            ttl
        });
        this.accessCount.set(key, 0);
        this.hitCount.set(key, 0);
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.metrics.misses++;
            return null;
        }

        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            this.accessCount.delete(key);
            this.hitCount.delete(key);
            this.metrics.misses++;
            return null;
        }

        // Update access patterns
        this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
        this.hitCount.set(key, (this.hitCount.get(key) || 0) + 1);
        this.metrics.hits++;

        // Adjust TTL based on access patterns if adaptive
        if (this.options.adaptiveTTL) {
            const newTTL = this.calculateTTL(key);
            if (newTTL > entry.ttl) {
                entry.ttl = newTTL;
                entry.expires = Date.now() + newTTL;
            }
        }

        return entry.value;
    }

    calculateTTL(key) {
        if (!this.options.adaptiveTTL) {
            return this.options.baseTTL;
        }

        const accessCount = this.accessCount.get(key) || 0;
        const hitCount = this.hitCount.get(key) || 0;
        const hitRate = accessCount > 0 ? hitCount / accessCount : 0;

        // Adjust TTL based on hit rate
        const ttlMultiplier = 1 + (hitRate * 2); // Up to 3x base TTL for frequently hit items
        const adaptedTTL = this.options.baseTTL * ttlMultiplier;

        return Math.min(
            Math.max(this.options.minTTL, adaptedTTL),
            this.options.maxTTL
        );
    }

    evictLRU() {
        let oldest = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.expires < oldestTime) {
                oldest = key;
                oldestTime = entry.expires;
            }
        }

        if (oldest) {
            this.cache.delete(oldest);
            this.accessCount.delete(oldest);
            this.hitCount.delete(oldest);
            this.metrics.evictions++;
        }
    }

    clear() {
        this.cache.clear();
        this.accessCount.clear();
        this.hitCount.clear();
        this.metrics = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    getMetrics() {
        const total = this.metrics.hits + this.metrics.misses;
        return {
            ...this.metrics,
            hitRate: total > 0 ? this.metrics.hits / total : 0,
            size: this.cache.size,
            maxSize: this.options.maxSize
        };
    }
}

const responseCache = new ResponseCache();

// Main export function with enhanced error handling and performance optimization
async function fetchGeminiResponse(prompt, options = {}) {
    try {
        // Check cache first
        const cacheKey = JSON.stringify({ prompt, options });
        const cachedResponse = responseCache.get(cacheKey);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Request through resource manager
        const response = await resourceManager.request(
            'CHAT_AI',
            async () => {
                const result = await geminiClient.executeRequest(prompt);
                responseCache.set(cacheKey, result);
                return result;
            },
            options.priority
        );

        return response;
    } catch (error) {
        log('error', 'Failed to fetch Gemini response', {
            error: error.message,
            prompt: prompt.substring(0, 100) + '...',
            metrics: geminiClient.getMetrics()
        });
        throw error;
    }
}

// Cleanup function with enhanced error handling
async function cleanup() {
    try {
        responseCache.clear();
        await geminiClient.client.destroy();
        log('info', 'AI module cleanup completed');
    } catch (error) {
        log('error', 'Failed to cleanup AI module', {
            error: error.message,
            stack: error.stack
        });
    }
}

// Export functions and metrics
export {
    fetchGeminiResponse,
    cleanup,
    geminiClient,
    responseCache
};
