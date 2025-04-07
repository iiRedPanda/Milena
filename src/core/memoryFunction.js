import { log } from './botLogger.js';
import fs from 'fs/promises';
import path from 'path';

// Memory cache with TTL and size limits
class MemoryManager {
    constructor(options = {}) {
        this.memories = new Map();
        this.options = {
            maxMemoriesPerChannel: options.maxMemoriesPerChannel || 50,
            memoryTTL: options.memoryTTL || 24 * 60 * 60 * 1000, // 24 hours
            savePath: options.savePath || path.join(process.cwd(), 'data', 'memories.json'),
            saveInterval: options.saveInterval || 5 * 60 * 1000, // 5 minutes
            maxMemorySize: options.maxMemorySize || 10 * 1024 * 1024 // 10MB
        };

        // Create save directory if it doesn't exist
        this.initializeStorage();
        
        // Start periodic saving
        this.startPeriodicSave();
    }

    async initializeStorage() {
        try {
            await fs.mkdir(path.dirname(this.options.savePath), { recursive: true });
            await this.loadMemories();
        } catch (error) {
            log('error', 'Failed to initialize memory storage', { error: error.message });
        }
    }

    async loadMemories() {
        try {
            const data = await fs.readFile(this.options.savePath, 'utf8');
            const loaded = JSON.parse(data);
            
            // Convert loaded data to Map structure with timestamps
            for (const [channelId, messages] of Object.entries(loaded)) {
                this.memories.set(channelId, messages.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                })));
            }
            
            log('info', 'Memories loaded successfully', {
                channelCount: this.memories.size
            });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                log('error', 'Failed to load memories', { error: error.message });
            }
        }
    }

    async saveMemories() {
        try {
            const serialized = {};
            for (const [channelId, messages] of this.memories) {
                serialized[channelId] = messages;
            }
            
            await fs.writeFile(
                this.options.savePath,
                JSON.stringify(serialized, null, 2),
                'utf8'
            );
            
            log('debug', 'Memories saved successfully');
        } catch (error) {
            log('error', 'Failed to save memories', { error: error.message });
        }
    }

    startPeriodicSave() {
        setInterval(() => {
            this.saveMemories();
        }, this.options.saveInterval);
    }

    getChannelMemories(channelId) {
        return this.memories.get(channelId) || [];
    }

    async addMemory(message) {
        const channelId = message.channel.id;
        if (!this.memories.has(channelId)) {
            this.memories.set(channelId, []);
        }

        const memories = this.memories.get(channelId);
        const newMemory = {
            content: message.content,
            author: message.author.tag,
            timestamp: new Date(),
            messageId: message.id
        };

        // Add new memory and maintain size limit
        memories.push(newMemory);
        if (memories.length > this.options.maxMemoriesPerChannel) {
            memories.shift(); // Remove oldest memory
        }

        // Clean up old memories
        this.cleanupOldMemories(channelId);

        // Check total memory size
        if (this.getMemorySize() > this.options.maxMemorySize) {
            this.reduceMemorySize();
        }

        log('debug', 'Memory added', {
            channelId,
            messageId: message.id,
            memoryCount: memories.length
        });
    }

    cleanupOldMemories(channelId) {
        const memories = this.memories.get(channelId);
        const now = Date.now();
        const validMemories = memories.filter(memory => 
            now - memory.timestamp.getTime() < this.options.memoryTTL
        );
        
        if (validMemories.length !== memories.length) {
            this.memories.set(channelId, validMemories);
            log('debug', 'Old memories cleaned up', {
                channelId,
                removed: memories.length - validMemories.length
            });
        }
    }

    getMemorySize() {
        return Buffer.byteLength(JSON.stringify(Object.fromEntries(this.memories)));
    }

    reduceMemorySize() {
        // Remove oldest memories until we're under the size limit
        while (this.getMemorySize() > this.options.maxMemorySize) {
            let oldestChannel = null;
            let oldestTimestamp = Date.now();

            for (const [channelId, memories] of this.memories) {
                if (memories.length > 0 && memories[0].timestamp < oldestTimestamp) {
                    oldestChannel = channelId;
                    oldestTimestamp = memories[0].timestamp;
                }
            }

            if (oldestChannel) {
                const memories = this.memories.get(oldestChannel);
                memories.shift();
                if (memories.length === 0) {
                    this.memories.delete(oldestChannel);
                }
            } else {
                break;
            }
        }

        log('info', 'Memory size reduced', {
            newSize: this.getMemorySize()
        });
    }

    async clearChannel(channelId) {
        this.memories.delete(channelId);
        await this.saveMemories();
        log('info', 'Channel memories cleared', { channelId });
    }

    async cleanup() {
        await this.saveMemories();
        this.memories.clear();
    }
}

// Create memory manager instance
const memoryManager = new MemoryManager();

// Handle process termination
process.on('SIGINT', async () => {
    await memoryManager.cleanup();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await memoryManager.cleanup();
    process.exit(0);
});

// Export functions
export async function processMessage(message) {
    await memoryManager.addMemory(message);
}

export async function getChannelMemory(channelId) {
    return memoryManager.getChannelMemories(channelId);
}

export async function clearChannelMemory(channelId) {
    await memoryManager.clearChannel(channelId);
}

export function getMemoryStats() {
    return {
        channelCount: memoryManager.memories.size,
        totalSize: memoryManager.getMemorySize()
    };
}
