import { logger } from './logger.js';
import { analytics } from '../services/analytics.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * Custom error types
 */
export class ValidationError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'ValidationError';
        this.context = context;
    }
}

export class PermissionError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'PermissionError';
        this.context = context;
    }
}

export class RateLimitError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'RateLimitError';
        this.context = context;
    }
}

export class TimeoutError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'TimeoutError';
        this.context = context;
    }
}

/**
 * Error handler service
 */
class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.lastErrorTime = new Map();
        this.setupRateLimiting();
    }

    setupRateLimiting() {
        // Clear rate limits periodically
        setInterval(() => {
            const now = Date.now();
            for (const [errorType, time] of this.lastErrorTime) {
                if (now - time > 60000) { // 1 minute
                    this.errorCounts.set(errorType, 0);
                }
            }
        }, 60000);
    }

    /**
     * Handle and log an error
     * @param {Error} error - The error to handle
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async handleError(error, context = {}) {
        try {
            // Track error rate
            const errorType = error.name || 'UnknownError';
            const currentCount = this.errorCounts.get(errorType) || 0;
            this.errorCounts.set(errorType, currentCount + 1);
            this.lastErrorTime.set(errorType, Date.now());

            // Log error
            logger.error('Error occurred', {
                error: error.message,
                stack: error.stack,
                type: errorType,
                ...context
            });

            // Track analytics
            analytics.trackError(errorType, error, context);

            // Handle specific error types
            switch (errorType) {
                case 'ValidationError':
                    return this.handleValidationError(error, context);
                case 'PermissionError':
                    return this.handlePermissionError(error, context);
                case 'RateLimitError':
                    return this.handleRateLimitError(error, context);
                case 'TimeoutError':
                    return this.handleTimeoutError(error, context);
                default:
                    return this.handleGenericError(error, context);
            }
        } catch (error) {
            logger.error('Failed to handle error', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Handle validation errors
     * @param {ValidationError} error - Validation error
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async handleValidationError(error, context) {
        const { interaction } = context;
        if (interaction) {
            await interaction.reply({
                content: error.message || MESSAGES.ERROR.INVALID_INPUT,
                ephemeral: true
            });
        }
    }

    /**
     * Handle permission errors
     * @param {PermissionError} error - Permission error
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async handlePermissionError(error, context) {
        const { interaction } = context;
        if (interaction) {
            await interaction.reply({
                content: error.message || MESSAGES.ERROR.NO_PERMISSION,
                ephemeral: true
            });
        }
    }

    /**
     * Handle rate limit errors
     * @param {RateLimitError} error - Rate limit error
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async handleRateLimitError(error, context) {
        const { interaction } = context;
        if (interaction) {
            await interaction.reply({
                content: error.message || MESSAGES.ERROR.RATE_LIMITED,
                ephemeral: true
            });
        }
    }

    /**
     * Handle timeout errors
     * @param {TimeoutError} error - Timeout error
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async handleTimeoutError(error, context) {
        const { interaction } = context;
        if (interaction) {
            await interaction.reply({
                content: error.message || MESSAGES.ERROR.TIMEOUT,
                ephemeral: true
            });
        }
    }

    /**
     * Handle generic errors
     * @param {Error} error - Generic error
     * @param {Object} context - Additional context
     * @returns {Promise<void>}
     */
    async handleGenericError(error, context) {
        const { interaction } = context;
        if (interaction) {
            await interaction.reply({
                content: MESSAGES.ERROR.GENERIC,
                ephemeral: true
            });
        }
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        return {
            totalErrors: this.errorCounts.size,
            errorTypes: Array.from(this.errorCounts.entries()),
            lastErrors: Array.from(this.lastErrorTime.entries())
        };
    }

    /**
     * Check if error rate is too high
     * @param {string} errorType - Type of error to check
     * @returns {boolean} True if error rate is too high
     */
    isRateLimited(errorType) {
        const count = this.errorCounts.get(errorType) || 0;
        return count > 5; // Allow 5 errors per minute
    }
}

const errorHandler = new ErrorHandler();
export { errorHandler, ValidationError, PermissionError, RateLimitError, TimeoutError };
