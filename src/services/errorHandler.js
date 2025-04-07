import logger from './logger.js';
import performance from './performance.js';
import { CircularBuffer } from '../utils/circularBuffer.js';

class ErrorHandler {
    constructor() {
        // Track recent errors for pattern detection
        this.recentErrors = new CircularBuffer(100);
        
        // Track error counts by type
        this.errorCounts = new Map();
        
        // Track error patterns
        this.errorPatterns = new Map();

        // Recovery strategies
        this.recoveryStrategies = new Map();

        // Circuit breaker states
        this.circuitBreakers = new Map();

        // Initialize default recovery strategies
        this.initializeRecoveryStrategies();

        // Start error analysis
        this.startErrorAnalysis();
    }

    /**
     * Initialize default recovery strategies
     */
    initializeRecoveryStrategies() {
        // API errors
        this.addRecoveryStrategy('API_ERROR', async (error, context) => {
            const retryCount = context.retryCount || 0;
            if (retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                return {
                    action: 'retry',
                    delay,
                    context: { ...context, retryCount: retryCount + 1 }
                };
            }
            return { action: 'fail' };
        });

        // Database errors
        this.addRecoveryStrategy('DB_ERROR', async (error, context) => {
            if (error.code === 'ECONNRESET') {
                return { action: 'retry', delay: 1000 };
            }
            return { action: 'fail' };
        });

        // Rate limit errors
        this.addRecoveryStrategy('RATE_LIMIT', async (error, context) => {
            if (error.retryAfter) {
                return { 
                    action: 'retry', 
                    delay: error.retryAfter * 1000,
                    context
                };
            }
            return { action: 'fail' };
        });

        // Memory errors
        this.addRecoveryStrategy('MEMORY_ERROR', async (error, context) => {
            global.gc && global.gc(); // Force garbage collection if available
            return { action: 'retry', delay: 1000 };
        });
    }

    /**
     * Add a custom recovery strategy
     */
    addRecoveryStrategy(errorType, strategy) {
        this.recoveryStrategies.set(errorType, strategy);
    }

    /**
     * Handle an error with recovery attempt
     */
    async handleError(error, context = {}) {
        const errorInfo = this.categorizeError(error);
        this.trackError(errorInfo);

        // Check circuit breaker
        if (this.isCircuitOpen(errorInfo.type)) {
            logger.log('warn', 'Circuit breaker is open, failing fast', {
                errorType: errorInfo.type,
                message: error.message
            });
            throw new Error(`Circuit breaker open for ${errorInfo.type}`);
        }

        // Get recovery strategy
        const strategy = this.recoveryStrategies.get(errorInfo.type);
        if (!strategy) {
            this.logError(error, errorInfo);
            throw error;
        }

        try {
            // Attempt recovery
            const result = await strategy(error, context);
            
            if (result.action === 'retry') {
                if (result.delay) {
                    await new Promise(resolve => setTimeout(resolve, result.delay));
                }
                return result;
            }
        } catch (recoveryError) {
            logger.log('error', 'Recovery strategy failed', {
                originalError: error.message,
                recoveryError: recoveryError.message
            });
        }

        this.logError(error, errorInfo);
        throw error;
    }

    /**
     * Categorize an error
     */
    categorizeError(error) {
        const info = {
            type: 'UNKNOWN_ERROR',
            severity: 'error',
            timestamp: Date.now()
        };

        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            info.type = 'DB_ERROR';
        } else if (error.status === 429) {
            info.type = 'RATE_LIMIT';
        } else if (error.message.includes('memory')) {
            info.type = 'MEMORY_ERROR';
        } else if (error.response && error.response.status) {
            info.type = 'API_ERROR';
        }

        return info;
    }

    /**
     * Track error occurrence
     */
    trackError(errorInfo) {
        this.recentErrors.push(errorInfo);
        
        const count = this.errorCounts.get(errorInfo.type) || 0;
        this.errorCounts.set(errorInfo.type, count + 1);

        // Update error patterns
        this.updateErrorPatterns(errorInfo);

        // Update circuit breaker
        this.updateCircuitBreaker(errorInfo.type);

        // Track in performance monitor
        performance.trackError(errorInfo.type.toLowerCase());
    }

    /**
     * Update error patterns
     */
    updateErrorPatterns(errorInfo) {
        const timeWindow = 300000; // 5 minutes
        const now = Date.now();
        
        // Get recent errors of this type
        const recentTypeErrors = this.recentErrors.getItems()
            .filter(e => e.type === errorInfo.type && now - e.timestamp < timeWindow);

        if (recentTypeErrors.length >= 5) {
            // Calculate error frequency
            const frequency = recentTypeErrors.length / (timeWindow / 1000);
            
            this.errorPatterns.set(errorInfo.type, {
                frequency,
                lastOccurrence: now,
                consecutive: recentTypeErrors.length
            });

            // Log if error frequency is high
            if (frequency > 0.1) { // More than 1 error per 10 seconds
                logger.log('warn', 'High error frequency detected', {
                    errorType: errorInfo.type,
                    frequency,
                    consecutive: recentTypeErrors.length
                });
            }
        }
    }

    /**
     * Update circuit breaker state
     */
    updateCircuitBreaker(errorType) {
        const breaker = this.circuitBreakers.get(errorType) || {
            state: 'closed',
            failures: 0,
            lastFailure: 0,
            nextAttempt: 0
        };

        const now = Date.now();
        
        if (breaker.state === 'half-open' && now < breaker.nextAttempt) {
            breaker.state = 'open';
            breaker.nextAttempt = now + 30000; // Try again in 30 seconds
        } else {
            breaker.failures++;
            breaker.lastFailure = now;

            if (breaker.failures >= 5) { // Open circuit after 5 failures
                breaker.state = 'open';
                breaker.nextAttempt = now + 30000;
            }
        }

        this.circuitBreakers.set(errorType, breaker);
    }

    /**
     * Check if circuit breaker is open
     */
    isCircuitOpen(errorType) {
        const breaker = this.circuitBreakers.get(errorType);
        if (!breaker) return false;

        const now = Date.now();
        
        if (breaker.state === 'open' && now >= breaker.nextAttempt) {
            breaker.state = 'half-open';
            breaker.failures = 0;
            return false;
        }

        return breaker.state === 'open';
    }

    /**
     * Log error with context
     */
    logError(error, errorInfo) {
        logger.log('error', 'Error occurred', {
            type: errorInfo.type,
            message: error.message,
            stack: error.stack,
            context: error.context || {},
            patterns: this.errorPatterns.get(errorInfo.type) || {},
            circuitBreaker: this.circuitBreakers.get(errorInfo.type) || {}
        });
    }

    /**
     * Start error analysis process
     */
    startErrorAnalysis() {
        // Analyze error patterns every minute
        setInterval(() => {
            const now = Date.now();
            
            // Clean up old patterns
            for (const [type, pattern] of this.errorPatterns.entries()) {
                if (now - pattern.lastOccurrence > 3600000) { // 1 hour
                    this.errorPatterns.delete(type);
                }
            }

            // Reset circuit breakers that have been open too long
            for (const [type, breaker] of this.circuitBreakers.entries()) {
                if (breaker.state === 'open' && now - breaker.lastFailure > 300000) { // 5 minutes
                    breaker.state = 'closed';
                    breaker.failures = 0;
                    logger.log('info', 'Circuit breaker reset', { errorType: type });
                }
            }

            // Log error statistics
            logger.log('info', 'Error statistics', {
                patterns: Object.fromEntries(this.errorPatterns),
                circuitBreakers: Object.fromEntries(this.circuitBreakers),
                counts: Object.fromEntries(this.errorCounts)
            });
        }, 60000);
    }

    /**
     * Get error statistics
     */
    getStats() {
        return {
            patterns: Object.fromEntries(this.errorPatterns),
            circuitBreakers: Object.fromEntries(this.circuitBreakers),
            counts: Object.fromEntries(this.errorCounts),
            recentErrors: this.recentErrors.getItems()
        };
    }
}

export default new ErrorHandler();
