const fs = require('fs').promises; // Use async file operations

class HybridMemory {
    constructor(memoryFile) {
        this.memoryFile = memoryFile;
        this.data = { channels: {} };
        this.lock = false; // Simulate a lock
        this.load();
    }

    async load() {
        try {
            const fileContent = await fs.readFile(this.memoryFile, 'utf-8');
            this.data = JSON.parse(fileContent);
            console.info(`Memory file ${this.memoryFile} loaded successfully.`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`Memory file ${this.memoryFile} not found. Starting with empty memory.`);
            } else if (error instanceof SyntaxError) {
                console.error(`Memory file ${this.memoryFile} contains invalid JSON. Starting with empty memory.`);
            } else {
                console.error(`Unexpected error loading memory file ${this.memoryFile}:`, error);
            }
        }
    }

    async save() {
        while (this.lock) await new Promise(resolve => setTimeout(resolve, 10)); // Wait for lock
        this.lock = true;
        try {
            await fs.writeFile(this.memoryFile, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error(`Failed to save memory file ${this.memoryFile}:`, error);
        } finally {
            this.lock = false;
        }
    }

    async addMessage(channelId, userId, content) {
        if (!this.data.channels[channelId]) {
            this.data.channels[channelId] = [];
        }

        this.data.channels[channelId].push({
            user: userId,
            content: content,
            timestamp: new Date().toISOString()
        });

        console.debug(`Message added to channel ${channelId}:`, { userId, content });
        await this.pruneOld();
        await this.save();
    }

    async getContext(channelId) {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago
        const context = (this.data.channels[channelId] || []).filter(msg =>
            new Date(msg.timestamp) >= cutoff
        );
        console.debug(`Context retrieved for channel ${channelId}:`, context);
        return context.slice(-6);
    }

    async pruneOld() {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago
        for (const channelId in this.data.channels) {
            this.data.channels[channelId] = this.data.channels[channelId].filter(
                msg => new Date(msg.timestamp) >= cutoff
            );
        }
        console.debug('Old messages pruned.');
        await this.save();
    }

    async clearChannelMemory(channelId) {
        if (this.data.channels[channelId]) {
            delete this.data.channels[channelId];
            console.info(`Memory cleared for channel ${channelId}.`);
            await this.save();
        }
    }
}

module.exports = HybridMemory;
