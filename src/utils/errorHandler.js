import logger from '../services/logger.js';
import { WebhookClient } from 'discord.js';

class ErrorHandler {
    constructor() {
        this.webhookClient = process.env.ERROR_WEBHOOK_URL ? 
            new WebhookClient({ url: process.env.ERROR_WEBHOOK_URL }) : null;
    }

    /**
     * Handle errors with different severity levels and appropriate responses
     */
    async handleError(error, context = {}) {
        const errorInfo = this.parseError(error);
        const severity = this.determineSeverity(errorInfo, context);
        
        // Log the error with appropriate level and context
        await logger.log(severity, errorInfo.message, {
            type: 'error',
            error: errorInfo,
            context,
            stack: error.stack
        });

        // Handle based on severity
        switch (severity) {
            case 'fatal':
                await this.handleFatalError(errorInfo, context);
                break;
            case 'error':
                await this.handleCriticalError(errorInfo, context);
                break;
            case 'warn':
                await this.handleWarning(errorInfo, context);
                break;
            default:
                await this.handleMinorError(errorInfo, context);
        }

        return {
            handled: true,
            severity,
            message: this.getUserFriendlyMessage(errorInfo, severity)
        };
    }

    /**
     * Parse error information into a standardized format
     */
    parseError(error) {
        return {
            message: error.message || 'An unknown error occurred',
            name: error.name || 'Error',
            code: error.code || 'UNKNOWN_ERROR',
            stack: error.stack,
            cause: error.cause,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Determine error severity based on error type and context
     */
    determineSeverity(errorInfo, context) {
        // Fatal errors
        if (
            errorInfo.code === 'DISCORD_TOKEN_INVALID' ||
            errorInfo.code === 'SHARD_DISCONNECTED' ||
            errorInfo.name === 'FatalError'
        ) {
            return 'fatal';
        }

        // Critical errors
        if (
            errorInfo.code === 'API_ERROR' ||
            errorInfo.code === 'DATABASE_ERROR' ||
            context.isCommand
        ) {
            return 'error';
        }

        // Warnings
        if (
            errorInfo.code === 'RATE_LIMITED' ||
            errorInfo.code === 'PERMISSION_MISSING'
        ) {
            return 'warn';
        }

        return 'info';
    }

    /**
     * Handle fatal errors that require immediate attention
     */
    async handleFatalError(errorInfo, context) {
        // Notify administrators
        await this.notifyAdmins(errorInfo, context);

        // Log detailed diagnostics
        await logger.log('fatal', 'Fatal error occurred', {
            type: 'error',
            error: errorInfo,
            context,
            diagnostics: await this.gatherDiagnostics()
        });
    }

    /**
     * Handle critical errors that need attention but aren't fatal
     */
    async handleCriticalError(errorInfo, context) {
        // Log with full context
        await logger.log('error', 'Critical error occurred', {
            type: 'error',
            error: errorInfo,
            context
        });

        // Notify if error rate is high
        if (await this.isErrorRateHigh()) {
            await this.notifyAdmins(errorInfo, context);
        }
    }

    /**
     * Handle warning level errors
     */
    async handleWarning(errorInfo, context) {
        await logger.log('warn', 'Warning occurred', {
            type: 'error',
            error: errorInfo,
            context
        });
    }

    /**
     * Handle minor errors that don't need special attention
     */
    async handleMinorError(errorInfo, context) {
        await logger.log('info', 'Minor error occurred', {
            type: 'error',
            error: errorInfo,
            context
        });
    }

    /**
     * Get user-friendly error message based on error type
     */
    getUserFriendlyMessage(errorInfo, severity) {
        const messages = {
            fatal: 'A critical error occurred. The bot administrators have been notified.',
            error: 'An error occurred while processing your request. Please try again later.',
            warn: "The operation could not be completed. Please try again.",
            info: 'Something went wrong. Please try again.'
        };

        return messages[severity] || messages.info;
    }

    /**
     * Notify administrators about critical issues
     */
    async notifyAdmins(errorInfo, context) {
        if (!this.webhookClient) return;

        try {
            const embed = {
                color: 0xFF0000,
                title: `🚨 ${errorInfo.name}`,
                description: errorInfo.message,
                fields: [
                    {
                        name: 'Error Code',
                        value: errorInfo.code,
                        inline: true
                    },
                    {
                        name: 'Timestamp',
                        value: errorInfo.timestamp,
                        inline: true
                    },
                    {
                        name: 'Context',
                        value: '```json\n' + JSON.stringify(context, null, 2) + '\n```'
                    },
                    {
                        name: 'Stack Trace',
                        value: '```\n' + (errorInfo.stack || 'No stack trace available').slice(0, 1000) + '\n```'
                    }
                ],
                timestamp: new Date()
            };

            await this.webhookClient.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to notify admins:', error);
        }
    }

    /**
     * Gather system diagnostics for debugging
     */
    async gatherDiagnostics() {
        return {
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            pid: process.pid,
            platform: process.platform,
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Check if error rate is above threshold
     */
    async isErrorRateHigh() {
        // Implement error rate tracking logic
        return false; // Placeholder
    }
}

const errorHandler = new ErrorHandler();
export default errorHandler;
