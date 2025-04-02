import fs from 'fs/promises';
import path from 'path';
import { logInfo, logError } from './logger.js';

export const STRINGS = {
    MEMORY_CLEARED: 'Memory for this channel has been cleared.',
    ADMIN_REQUIRED: 'You need to be an administrator or have an allowed admin role to use this command.',
    INVALID_COMMAND: 'Invalid setup command. Use `!setup allowChannel`, `!setup allowRole`, `!setup allowAdminRole`, or `!setup setErrorChannel`.',
    ERROR_NOTIFICATION: 'Error notifications will be sent to',
    HELP_MESSAGE: `
 **Milena Bot Commands:**
 - Mention the bot or reply to its messages to interact.
 - Use \`!clear\` to clear the memory for the current channel.
 - Use \`!help\` to display this help message.
 - Use \`!status\` to view bot status and configuration.
 `,
};

export let memory = {}; // Export memory for conversation history
export let configurations = {}; // Export configurations for server-specific settings

const logsBaseDir = path.resolve('logs');
const jsonLogsDir = path.join(logsBaseDir, 'json');
const logRetentionDays = 14; // Retain log files for 14 days

/**
 * Save memory to a JSON file.
 */
export async function saveMemory() {
    try {
        const filePath = path.join(jsonLogsDir, 'memory.json');
        await fs.writeFile(filePath, JSON.stringify(memory, null, 2));
        logInfo('Memory saved successfully.', { filePath });
    } catch (error) {
        logError('Error saving memory.', { error });
    }
}

/**
 * Save configurations to a JSON file.
 */
export async function saveConfigurations() {
    try {
        const filePath = path.join(jsonLogsDir, 'configurations.json');
        await fs.writeFile(filePath, JSON.stringify(configurations, null, 2));
        logInfo('Configurations saved successfully.', { filePath });
    } catch (error) {
        logError('Error saving configurations.', { error });
    }
}

/**
 * Summarize messages in a channel between two message IDs.
 * @param {string} channelId - The ID of the channel.
 * @param {string} startMessageId - The ID of the starting message.
 * @param {string} endMessageId - The ID of the ending message.
 * @returns {Promise<string>} - A summary of the messages.
 */
export async function summarizeMessages(channelId, startMessageId, endMessageId) {
    // Placeholder implementation for summarizing messages
    return `Summary of messages in channel ${channelId} from ${startMessageId} to ${endMessageId}.`;
}

/**
 * Clean up old log files and unnecessary JSON files.
 */
export async function cleanLogs() {
    try {
        logInfo('Starting log cleanup process...');

        // Remove old log files
        const logDirs = ['general', 'errors', 'debug'];
        const now = Date.now();

        for (const dir of logDirs) {
            const logDirPath = path.join(logsBaseDir, dir);
            const files = await fs.readdir(logDirPath).catch(() => []);
            for (const file of files) {
                const filePath = path.join(logDirPath, file);
                const stats = await fs.stat(filePath).catch(() => null);
                if (stats && now - stats.mtimeMs > logRetentionDays * 24 * 60 * 60 * 1000) {
                    await fs.unlink(filePath);
                    logInfo(`Deleted old log file: ${filePath}`);
                }
            }
        }

        // Remove unnecessary JSON files
        const jsonFiles = await fs.readdir(jsonLogsDir).catch(() => []);
        const requiredFiles = ['memory.json', 'configurations.json']; // Files we want to keep
        for (const file of jsonFiles) {
            if (!requiredFiles.includes(file)) {
                const filePath = path.join(jsonLogsDir, file);
                await fs.unlink(filePath);
                logInfo(`Deleted unnecessary JSON file: ${filePath}`);
            }
        }

        logInfo('Log cleanup process completed successfully.');
    } catch (error) {
        logError('Error during log cleanup process.', { error });
    }
}
