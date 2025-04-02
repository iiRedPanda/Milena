import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';

// Ensure the logs directory structure exists
const logsBaseDir = path.resolve('logs');
const jsonLogsDir = path.join(logsBaseDir, 'json');
const generalLogsDir = path.join(logsBaseDir, 'general');
const errorLogsDir = path.join(logsBaseDir, 'errors');
const debugLogsDir = path.join(logsBaseDir, 'debug');

// Create directories if they don't exist
[logsBaseDir, jsonLogsDir, generalLogsDir, errorLogsDir, debugLogsDir].forEach((dir) => {
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
};

// Define colors for log levels (for console output)
const logColors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
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
    level: 'info', // Default log level
    format: logFormat,
    transports: [
        // General logs
        new DailyRotateFile({
            filename: path.join(generalLogsDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '10m',
            maxFiles: '14d',
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
    ],
});

// Utility functions for logging
export const logInfo = (message, meta = {}) => logger.info(message, meta);
export const logWarn = (message, meta = {}) => logger.warn(message, meta);
export const logError = (message, meta = {}) => logger.error(message, meta);
export const logDebug = (message, meta = {}) => logger.debug(message, meta);

export default logger;
