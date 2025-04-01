const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new DailyRotateFile({
            filename: 'logs/bot-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '10m',
            maxFiles: '14d',
        }),
        new winston.transports.Console(),
    ],
});

function logError(message, error, meta = {}) {
    logger.error(`${message}: ${error.message}`, { ...meta, stack: error.stack });
}

function logInfo(message, meta = {}) {
    logger.info(message, meta);
}

function logWarn(message, meta = {}) {
    logger.warn(message, meta);
}

module.exports = { logError, logInfo, logWarn };