import { Client, GatewayIntentBits } from 'discord.js';
import { log } from '../botLogger.js';
import { loadCommands, reloadCommand } from './commands/index.js';
import { cleanup as cleanupMemory } from './memoryFunction.js';
import { cleanup as cleanupAI } from './ai.js';

class BotClient extends Client {
    constructor(options = {}) {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            ...options
        });

        this.healthCheck = {
            lastPing: Date.now(),
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            reconnectDelay: 5000,
        };

        this.setupErrorHandling();
        this.setupHealthCheck();
    }

    setupErrorHandling() {
        // Handle Discord.js specific errors
        this.on('error', error => {
            log('error', 'Discord client error', {
                error: error.message,
                stack: error.stack
            });
            this.attemptReconnect();
        });

        this.on('disconnect', () => {
            log('warn', 'Discord client disconnected');
            this.attemptReconnect();
        });

        this.on('reconnecting', () => {
            log('info', 'Discord client reconnecting', {
                attempt: this.healthCheck.reconnectAttempts + 1
            });
        });

        // Handle process-wide errors
        process.on('uncaughtException', error => {
            log('error', 'Uncaught exception', {
                error: error.message,
                stack: error.stack
            });
            this.gracefulShutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            log('error', 'Unhandled promise rejection', {
                reason: reason?.message || reason,
                stack: reason?.stack
            });
        });
    }

    setupHealthCheck() {
        // Monitor websocket heartbeat
        this.ws?.on('heartbeat', () => {
            this.healthCheck.lastPing = Date.now();
        });

        // Check connection health every minute
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastPing = now - this.healthCheck.lastPing;

            if (timeSinceLastPing > 3 * 60 * 1000) { // No heartbeat for 3 minutes
                log('warn', 'No heartbeat received', {
                    timeSinceLastPing: `${Math.round(timeSinceLastPing / 1000)}s`
                });
                this.attemptReconnect();
            }
        }, 60000);
    }

    async attemptReconnect() {
        if (this.healthCheck.reconnectAttempts >= this.healthCheck.maxReconnectAttempts) {
            log('error', 'Max reconnection attempts reached, shutting down');
            await this.gracefulShutdown();
            return;
        }

        this.healthCheck.reconnectAttempts++;
        const delay = this.healthCheck.reconnectDelay * Math.pow(2, this.healthCheck.reconnectAttempts - 1);

        log('info', 'Attempting to reconnect', {
            attempt: this.healthCheck.reconnectAttempts,
            delay: `${delay}ms`
        });

        setTimeout(() => {
            this.destroy();
            this.login(process.env.DISCORD_TOKEN);
        }, delay);
    }

    async gracefulShutdown(code = 1) {
        log('info', 'Initiating graceful shutdown');

        try {
            // Cleanup subsystems
            await Promise.allSettled([
                cleanupMemory(),
                cleanupAI()
            ]);

            // Close Discord connection
            if (this.isReady()) {
                await this.destroy();
            }

            log('info', 'Graceful shutdown completed');
        } catch (error) {
            log('error', 'Error during shutdown', {
                error: error.message,
                stack: error.stack
            });
        } finally {
            process.exit(code);
        }
    }

    async reloadCommand(commandName) {
        try {
            await reloadCommand(this, commandName);
            log('info', `Successfully reloaded command: ${commandName}`);
            return true;
        } catch (error) {
            log('error', `Failed to reload command: ${commandName}`, {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    async initialize() {
        try {
            // Load commands
            await loadCommands(this);

            // Login to Discord
            await this.login(process.env.DISCORD_TOKEN);

            log('info', 'Bot initialized successfully', {
                username: this.user?.tag,
                guilds: this.guilds.cache.size
            });

            // Reset reconnect counter on successful connection
            this.healthCheck.reconnectAttempts = 0;

        } catch (error) {
            log('error', 'Failed to initialize bot', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

// Create and export bot instance
const bot = new BotClient();
export default bot;

// Handle termination signals
process.on('SIGINT', async () => {
    await bot.gracefulShutdown(0);
});

process.on('SIGTERM', async () => {
    await bot.gracefulShutdown(0);
});