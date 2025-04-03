import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';

// Ensure the logs directory structure exists
const logsBaseDir = path.resolve('logs');
const infoLogsDir = path.join(logsBaseDir, 'info');
const errorLogsDir = path.join(logsBaseDir, 'errors');
const debugLogsDir = path.join(logsBaseDir, 'debug');
const startupLogsDir = path.join(logsBaseDir, 'startup');
const runtimeLogsDir = path.join(logsBaseDir, 'runtime');
const generalLogsDir = path.join(logsBaseDir, 'general');

// Create directories if they don't exist
[logsBaseDir, infoLogsDir, errorLogsDir, debugLogsDir, startupLogsDir, runtimeLogsDir, generalLogsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Define log levels for better categorization
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    startup: 4,
    runtime: 5,
    general: 6,
};

// Define colors for log levels (for console output)
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    startup: 'magenta',
    runtime: 'cyan',
    general: 'white',
};

// Apply colors to the console transport
winston.addColors(logColors);

// Create a custom format for logs
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaString}`;
    })
);

// Centralize log level configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Configure the logger
const logger = winston.createLogger({
    levels: logLevels,
    format: logFormat,
    transports: [
        // Info logs
        new DailyRotateFile({
            filename: path.join(infoLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            maxSize: '10m',
            maxFiles: '7d', // Updated to 7 days
        }),
        // Error logs
        new DailyRotateFile({
            filename: path.join(errorLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '10m',
            maxFiles: '14d',
        }),
        // Debug logs
        new DailyRotateFile({
            filename: path.join(debugLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'debug',
            maxSize: '10m',
            maxFiles: '14d',
        }),
        // Startup logs
        new DailyRotateFile({
            filename: path.join(startupLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'startup',
            maxSize: '10m',
            maxFiles: '14d',
        }),
        // Runtime logs
        new DailyRotateFile({
            filename: path.join(runtimeLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'runtime',
            maxSize: '10m',
            maxFiles: '14d',
        }),
        // General logs
        new DailyRotateFile({
            filename: path.join(generalLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'general',
            maxSize: '10m',
            maxFiles: '14d',
        }),
    ],
});

// Add a console transport with log level filtering
logger.add(new winston.transports.Console({
    level: LOG_LEVEL,
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] [${level.toUpperCase()}]: ${message}`)
    ),
}));

// Validate log levels
const validLogLevels = Object.keys(logLevels);
function validateLogLevel(level) {
    if (!validLogLevels.includes(level)) {
        throw new Error(`Invalid log level: ${level}. Valid levels are: ${validLogLevels.join(', ')}`);
    }
}

// Add fallback for logging failures
logger.on('error', (error) => {
    console.error(`[Logging Error]: ${error.message}`);
});

// Validate transports
logger.transports.forEach((transport) => {
    if (transport instanceof DailyRotateFile) {
        if (!validLogLevels.includes(transport.level)) {
            console.error(`Misconfigured transport: Invalid level "${transport.level}" in transport for file "${transport.filename}"`);
        }
    }
});

// Sanitize metadata
function sanitizeMeta(meta) {
    try {
        return JSON.stringify(meta);
    } catch (error) {
        return '[Invalid Metadata]';
    }
}

// Utility functions for logging with validation and sanitization
export const logInfo = (message, meta = {}) => {
    validateLogLevel('info');
    logger.log('info', message, sanitizeMeta(meta));
};
export const logWarn = (message, meta = {}) => {
    validateLogLevel('warn');
    logger.log('warn', message, sanitizeMeta(meta));
};
export const logError = (message, meta = {}) => {
    validateLogLevel('error');
    logger.log('error', message, sanitizeMeta(meta));
};
export const logDebug = (message, meta = {}) => {
    validateLogLevel('debug');
    logger.log('debug', message, sanitizeMeta(meta));
};
export const logStartup = (message, meta = {}) => {
    validateLogLevel('startup');
    logger.log('startup', message, sanitizeMeta(meta));
};
export const logRuntime = (message, meta = {}) => {
    validateLogLevel('runtime');
    logger.log('runtime', message, sanitizeMeta(meta));
};
export const logGeneral = (message, meta = {}) => {
    validateLogLevel('general');
    logger.log('general', message, sanitizeMeta(meta));
};

export default logger;
