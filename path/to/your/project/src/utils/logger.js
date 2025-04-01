const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// ... (logger configuration code)

function logError(message, error, meta = {}, type = 'general') {
    // ... (error logging logic)
}

function logInfo(message, meta = {}) {
    logger.info(message, meta);
}

function logWarn(message, meta = {}) {
    logger.warn(message, meta);
}

module.exports = { logError, logInfo, logWarn };