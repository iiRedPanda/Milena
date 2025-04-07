import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../constants/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

export const LOGGING_CONFIG = {
    // Base configuration for all loggers
    base: {
        dirname: logsDir,
        maxsize: CONFIG.LOGGING.MAX_FILE_SIZE,
        maxFiles: CONFIG.LOGGING.MAX_FILES,
        tailable: true,
        zippedArchive: true,
        format: {
            timestamp: true,
            json: false,
            colorize: false,
            metadata: true // Include metadata for better debugging
        }
    },

    // Category-specific configurations
    categories: {
        error: {
            level: 'error',
            filename: 'error-%DATE%.log',
            dirname: path.join(logsDir, 'errors'),
            datePattern: 'YYYY-MM-DD',
            format: {
                stack: true,
                json: true,
                metadata: true,
                // Include additional error context
                transform: (info) => ({
                    ...info,
                    context: {
                        command: info.command,
                        user: info.user,
                        guild: info.guild,
                        timestamp: new Date().toISOString()
                    }
                })
            }
        },
        warn: {
            level: 'warn',
            filename: 'warn-%DATE%.log',
            dirname: path.join(logsDir, 'warnings'),
            datePattern: 'YYYY-MM-DD',
            format: {
                metadata: true
            }
        },
        info: {
            level: 'info',
            filename: 'info-%DATE%.log',
            dirname: path.join(logsDir, 'info'),
            datePattern: 'YYYY-MM-DD',
            format: {
                metadata: true
            }
        },
        debug: {
            level: 'debug',
            filename: 'debug-%DATE%.log',
            dirname: path.join(logsDir, 'debug'),
            datePattern: 'YYYY-MM-DD',
            format: {
                metadata: true,
                // Include call stack for debugging
                transform: (info) => ({
                    ...info,
                    stack: info.stack || new Error().stack
                })
            }
        },
        performance: {
            level: 'info',
            filename: 'performance-%DATE%.log',
            dirname: path.join(logsDir, 'performance'),
            datePattern: 'YYYY-MM-DD',
            format: {
                json: true,
                metadata: true,
                // Include performance metrics
                transform: (info) => ({
                    ...info,
                    metrics: {
                        memory: process.memoryUsage(),
                        cpu: process.cpuUsage(),
                        uptime: process.uptime(),
                        timestamp: Date.now()
                    }
                })
            }
        },
        security: {
            level: 'info',
            filename: 'security-%DATE%.log',
            dirname: path.join(logsDir, 'security'),
            datePattern: 'YYYY-MM-DD',
            format: {
                json: true,
                metadata: true,
                // Include security context
                transform: (info) => ({
                    ...info,
                    context: {
                        ip: info.ip,
                        user: info.user,
                        action: info.action,
                        resource: info.resource,
                        timestamp: new Date().toISOString()
                    }
                })
            }
        },
        audit: {
            level: 'info',
            filename: 'audit-%DATE%.log',
            dirname: path.join(logsDir, 'audit'),
            datePattern: 'YYYY-MM-DD',
            format: {
                json: true,
                metadata: true,
                // Include audit trail
                transform: (info) => ({
                    ...info,
                    audit: {
                        user: info.user,
                        action: info.action,
                        changes: info.changes,
                        before: info.before,
                        after: info.after,
                        timestamp: new Date().toISOString()
                    }
                })
            }
        }
    },

    // Archive configuration
    archive: {
        enabled: true,
        dirname: path.join(logsDir, 'archive'),
        format: 'zip',
        maxSize: '1GB',
        retain: '90d' // Keep archives for 90 days
    },

    // Cleanup configuration
    cleanup: {
        enabled: true,
        maxAge: '30d', // Keep logs for 30 days
        interval: '24h', // Run cleanup every 24 hours
        exclude: ['security', 'audit'] // Don't auto-cleanup security and audit logs
    },

    // Console output configuration
    console: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        format: {
            colorize: true,
            timestamp: true,
            json: false,
            // Pretty print in development
            prettyPrint: process.env.NODE_ENV !== 'production'
        }
    },

    // Alert configuration
    alerts: {
        enabled: true,
        thresholds: {
            errors: 10, // Alert after 10 errors in 5 minutes
            warnings: 20, // Alert after 20 warnings in 5 minutes
            memory: 0.8, // Alert at 80% memory usage
            cpu: 0.7 // Alert at 70% CPU usage
        },
        interval: '5m', // Check every 5 minutes
        channels: ['discord'] // Alert channels
    }
};
