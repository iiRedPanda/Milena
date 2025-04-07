const fs = require('fs').promises; // Use async file operations
const { Mutex } = require('async-mutex');
import { logInfo, logWarn, logError, logDebug } from './src/logger.js'; // Use ES module import for logger
import { globalMemoryPruneInterval } from './src/utils.js'; // Import global memory pruning interval

/**
 * A class to manage hybrid memory for storing channel-specific data.
 */
class HybridMemory {
    /**
     * Initialize the HybridMemory system.
     * @param {string} memoryFile - The file path for storing memory data.
     */
    constructor(memoryFile) {
        this.memoryFile = memoryFile;
        this.data = { channels: {} };
        this.mutex = new Mutex();
        this.load();
    }

    /**
     * Load memory data from the file.
     */
    async load() {
        try {
            const fileContent = await fs.readFile(this.memoryFile, 'utf-8');
            this.data = JSON.parse(fileContent);
            logInfo(`Memory file ${this.memoryFile} loaded successfully.`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                logWarn(`Memory file ${this.memoryFile} not found. Starting with empty memory.`);
            } else if (error instanceof SyntaxError) {
                logError(`Memory file ${this.memoryFile} contains invalid JSON. Starting with empty memory.`);
            } else {
                logError(`Unexpected error loading memory file ${this.memoryFile}:`, { error });
            }
        }
    }

    /**
     * Save memory data to the file.
     */
    async save() {
        const release = await this.mutex.acquire();
        try {
            await fs.writeFile(this.memoryFile, JSON.stringify(this.data, null, 2));
        } finally {
            release();
        }
    }

    /**
     * Add a message to a channel's memory.
     * @param {string} channelId - The ID of the channel.
     * @param {string} userId - The ID of the user.
     * @param {string} content - The content of the message.
     */
    async addMessage(channelId, userId, content) {
        if (!this.data.channels[channelId]) {
            this.data.channels[channelId] = [];
        }

        this.data.channels[channelId].push({
            user: userId,
            content: content,
            timestamp: new Date().toISOString()
        });

        logDebug(`Message added to channel ${channelId}:`, { userId, content });
        await this.pruneOld();
        await this.save();
    }

    /**
     * Retrieve the context (recent messages) for a channel.
     * @param {string} channelId - The ID of the channel.
     * @returns {Array} - The recent messages in the channel.
     */
    async getContext(channelId) {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago
        const context = (this.data.channels[channelId] || []).filter(msg =>
            new Date(msg.timestamp) >= cutoff
        );
        logDebug(`Context retrieved for channel ${channelId}:`, context);
        return context.slice(-6);
    }

    /**
     * Prune messages older than the retention period from memory.
     */
    async pruneOld() {
        const now = Date.now();
        const cutoff = now - globalMemoryPruneInterval * 60 * 60 * 1000; // Convert hours to milliseconds

        for (const channelId in this.data.channels) {
            const initialCount = this.data.channels[channelId].length;
            this.data.channels[channelId] = this.data.channels[channelId].filter(
                msg => new Date(msg.timestamp) >= cutoff
            );
            const prunedCount = initialCount - this.data.channels[channelId].length;
            logDebug(`Pruned ${prunedCount} messages from channel ${channelId}.`);
        }

        logDebug('Old messages pruned globally.');
        await this.save();
    }

    /**
     * Clear memory for a specific channel.
     * @param {string} channelId - The ID of the channel.
     */
    async clearChannelMemory(channelId) {
        if (this.data.channels[channelId]) {
            delete this.data.channels[channelId];
            logInfo(`Memory cleared for channel ${channelId}.`);
            await this.save();
        }
    }
}

module.exports = HybridMemory;
