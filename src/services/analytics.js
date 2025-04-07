import { logger } from '../core/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MESSAGES } from '../constants/messages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRICS_FILE = path.join(__dirname, '../../data/analytics.json');
const MAX_METRICS_SIZE = 1000000; // 1MB
const METRICS_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const MAX_ERROR_ENTRIES = 1000;

/**
 * Analytics service for tracking bot metrics and events
 */
class Analytics {
    constructor() {
        this.metrics = {
            commands: new Map(),
            games: new Map(),
            errors: new Map(),
            lastCleanup: Date.now()
        };

        // Load existing metrics
        this.loadMetrics().catch(error => {
            logger.error('Failed to load analytics metrics', {
                error: error.message,
                stack: error.stack
            });
        });

        // Setup periodic cleanup
        this.setupCleanup();
    }

    async loadMetrics() {
        try {
            const data = await fs.readFile(METRICS_FILE, 'utf-8');
            const metrics = JSON.parse(data);
            Object.assign(this.metrics, metrics);
            logger.info('Analytics metrics loaded successfully');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            logger.info('No existing analytics metrics found');
        }
    }

    async saveMetrics() {
        try {
            const data = JSON.stringify(this.metrics, null, 2);
            if (data.length > MAX_METRICS_SIZE) {
                this.cleanupMetrics();
            }
            await fs.writeFile(METRICS_FILE, data);
            logger.info('Analytics metrics saved successfully');
        } catch (error) {
            logger.error('Failed to save analytics metrics', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    setupCleanup() {
        setInterval(() => {
            this.cleanupMetrics();
        }, METRICS_CLEANUP_INTERVAL);
    }

    cleanupMetrics() {
        // Cleanup old command metrics
        for (const [command, metrics] of this.metrics.commands) {
            if (metrics.uses < 10) {
                this.metrics.commands.delete(command);
            }
        }

        // Cleanup old game metrics
        for (const [game, metrics] of this.metrics.games) {
            if (metrics.gamesPlayed < 5) {
                this.metrics.games.delete(game);
            }
        }

        // Cleanup old error entries
        for (const [category, metrics] of this.metrics.errors) {
            const recentErrors = Array.from(metrics.errorTypes.entries())
                .filter(([type, count]) => count > 0)
                .slice(0, MAX_ERROR_ENTRIES);
            
            metrics.errorTypes = new Map(recentErrors);
        }

        this.metrics.lastCleanup = Date.now();
        this.saveMetrics().catch(error => {
            logger.error('Failed to save metrics after cleanup', {
                error: error.message,
                stack: error.stack
            });
        });
    }

    validateData(data, requiredFields = []) {
        if (!data) {
            throw new Error('Analytics data cannot be null');
        }

        for (const field of requiredFields) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
    }

    trackEvent(eventName, data = {}) {
        try {
            this.validateData(data, ['category']);
            logger.info('Analytics event tracked', {
                event: eventName,
                ...data
            });
        } catch (error) {
            logger.error('Failed to track event', {
                error: error.message,
                stack: error.stack,
                event: eventName,
                data
            });
        }
    }

    trackCommandExecution(commandName, data = {}) {
        try {
            this.validateData(data, ['userId', 'guildId']);

            const commandMetrics = this.metrics.commands.get(commandName) || {
                uses: 0,
                errors: 0,
                avgResponseTime: 0,
                lastUsed: null,
                users: new Set()
            };

            commandMetrics.uses++;
            commandMetrics.users.add(data.userId);
            commandMetrics.lastUsed = Date.now();

            if (data.duration) {
                commandMetrics.avgResponseTime = 
                    (commandMetrics.avgResponseTime * (commandMetrics.uses - 1) + data.duration) / 
                    commandMetrics.uses;
            }

            if (data.error) {
                commandMetrics.errors++;
            }

            this.metrics.commands.set(commandName, commandMetrics);
            this.saveMetrics().catch(error => {
                logger.error('Failed to save command metrics', {
                    error: error.message,
                    stack: error.stack,
                    command: commandName
                });
            });

            this.trackEvent('command_executed', { 
                category: 'command',
                commandName,
                ...data 
            });

        } catch (error) {
            logger.error('Failed to track command execution', {
                error: error.message,
                stack: error.stack,
                commandName,
                data
            });
        }
    }

    trackGameEvent(eventName, data = {}) {
        try {
            this.validateData(data, ['gameType', 'gameId']);

            const gameMetrics = this.metrics.games.get(data.gameType) || {
                gamesPlayed: 0,
                totalPlayers: 0,
                avgDuration: 0,
                winRate: new Map(),
                activeGames: 0,
                lastPlayed: null
            };

            switch (eventName) {
                case 'game_started':
                    gameMetrics.gamesPlayed++;
                    gameMetrics.totalPlayers += data.playerCount || 0;
                    gameMetrics.activeGames++;
                    gameMetrics.lastPlayed = Date.now();
                    break;
                case 'game_ended':
                    gameMetrics.activeGames--;
                    if (data.duration) {
                        gameMetrics.avgDuration = 
                            (gameMetrics.avgDuration * (gameMetrics.gamesPlayed - 1) + data.duration) / 
                            gameMetrics.gamesPlayed;
                    }
                    if (data.winner) {
                        const wins = gameMetrics.winRate.get(data.winner) || 0;
                        gameMetrics.winRate.set(data.winner, wins + 1);
                    }
                    break;
            }

            this.metrics.games.set(data.gameType, gameMetrics);
            this.saveMetrics().catch(error => {
                logger.error('Failed to save game metrics', {
                    error: error.message,
                    stack: error.stack,
                    gameType: data.gameType
                });
            });

            this.trackEvent('game_event', { 
                category: 'game',
                eventName,
                ...data 
            });

        } catch (error) {
            logger.error('Failed to track game event', {
                error: error.message,
                stack: error.stack,
                eventName,
                data
            });
        }
    }

    trackError(category, error, context = {}) {
        try {
            this.validateData(context, ['userId', 'guildId']);

            const errorMetrics = this.metrics.errors.get(category) || {
                count: 0,
                lastOccurred: null,
                errorTypes: new Map(),
                recentErrors: []
            };

            const errorType = error.name || 'Unknown';
            const typeCount = errorMetrics.errorTypes.get(errorType) || 0;
            errorMetrics.errorTypes.set(errorType, typeCount + 1);

            errorMetrics.count++;
            errorMetrics.lastOccurred = Date.now();

            // Add recent error with context
            const recentError = {
                timestamp: Date.now(),
                errorType,
                message: error.message,
                stack: error.stack,
                ...context
            };

            errorMetrics.recentErrors.unshift(recentError);
            if (errorMetrics.recentErrors.length > MAX_ERROR_ENTRIES) {
                errorMetrics.recentErrors.pop();
            }

            this.metrics.errors.set(category, errorMetrics);
            this.saveMetrics().catch(error => {
                logger.error('Failed to save error metrics', {
                    error: error.message,
                    stack: error.stack,
                    category
                });
            });

            this.trackEvent('error_occurred', {
                category,
                errorType,
                message: error.message,
                ...context
            });

            logger.error('Error tracked', {
                category,
                error: error.message,
                stack: error.stack,
                context
            });

        } catch (error) {
            logger.error('Failed to track error', {
                error: error.message,
                stack: error.stack,
                category,
                error
            });
        }
    }

    getMetrics() {
        return {
            commands: Array.from(this.metrics.commands.entries()).map(([name, metrics]) => ({
                name,
                ...metrics
            })),
            games: Array.from(this.metrics.games.entries()).map(([type, metrics]) => ({
                type,
                ...metrics
            })),
            errors: Array.from(this.metrics.errors.entries()).map(([category, metrics]) => ({
                category,
                ...metrics
            })),
            lastCleanup: this.metrics.lastCleanup
        };
    }
}

const analytics = new Analytics();
export { analytics };
