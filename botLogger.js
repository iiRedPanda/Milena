import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Define the base log folder and ensure it exists
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // Get the directory name of the current module
const logBaseFolder = path.join(__dirname, 'logs'); // Base logs folder
if (!fs.existsSync(logBaseFolder)) {
    try {
        fs.mkdirSync(logBaseFolder, { recursive: true }); // Ensure the folder is created recursively
    } catch (error) {
        // Log logging errors to a dedicated file
        fs.appendFileSync(path.join(logBaseFolder, 'logging_errors.log'), `[${new Date().toISOString()}] Failed to create base log folder: ${error.message}\n`);
    }
}

/**
 * Formats the current date and time in the specified format and CET timezone.
 * @returns {string} - The formatted date and time string.
 */
function getFormattedTimestamp() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'CET',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const date = `${parts.find(p => p.type === 'day').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'year').value}`;
    const time = `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}:${parts.find(p => p.type === 'second').value}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    return `${date}T${time}`;
}

/**
 * Logs a message to a file based on the log category.
 * @param {string} category - The category of the log (e.g., 'message', 'api', 'memory', 'error', 'debug').
 * @param {string} message - The message to log.
 * @param {object} [meta] - Optional metadata to include in the log.
 */
export function log(category, message, meta = {}) {
    try {
        const timestamp = getFormattedTimestamp();
        const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
        const logMessage = `[${timestamp}] [${category.toUpperCase()}] ${message}${metaString}\n`;

        // Determine the log file path based on the category and date
        const logFilePath = getLogFilePath(category);

        // Append the log message to the appropriate file
        fs.appendFileSync(logFilePath, logMessage, 'utf8');
    } catch (fileError) {
        // Log logging errors to a dedicated file
        const errorLogPath = path.join(logBaseFolder, 'logging_errors.log');
        fs.appendFileSync(errorLogPath, `[${getFormattedTimestamp()}] Failed to write log: ${fileError.message}\n`);
    }
}

/**
 * Logs an error with additional metadata.
 * @param {string} type - The type of error (e.g., 'runtime', 'api', 'validation').
 * @param {Error} error - The error object to log.
 * @param {object} [meta] - Additional metadata to include in the log.
 */
export function logError(type, error, meta = {}) {
    log(type, error.message, meta);
}

/**
 * Determines the log file path based on the category and current date.
 * @param {string} category - The category of the log.
 * @returns {string} - The full path to the log file.
 */
function getLogFilePath(category) {
    const date = new Date().toLocaleDateString('en-GB', { timeZone: 'CET' }).split('/').reverse().join('-'); // Get the current date (YYYY-MM-DD)
    const categoryFolder = path.join(logBaseFolder, category.toLowerCase()); // Subfolder for the category

    // Ensure the category folder exists
    if (!fs.existsSync(categoryFolder)) {
        fs.mkdirSync(categoryFolder, { recursive: true });
    }

    // Return the full path to the log file with the date in the file name
    return path.join(categoryFolder, `${date}.log`);
}
