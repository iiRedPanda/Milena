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

// Utility functions for logging
export const logInfo = (message, meta = {}) => logger.log('info', message, meta);
export const logWarn = (message, meta = {}) => logger.log('warn', message, meta);
export const logError = (message, meta = {}) => logger.log('error', message, meta);
export const logDebug = (message, meta = {}) => logger.log('debug', message, meta);
export const logStartup = (message, meta = {}) => logger.log('startup', message, meta);
export const logRuntime = (message, meta = {}) => logger.log('runtime', message, meta);
export const logGeneral = (message, meta = {}) => logger.log('general', message, meta);

export default logger;
