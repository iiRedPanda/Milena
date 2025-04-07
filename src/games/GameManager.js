import { Collection } from 'discord.js';
import { CONFIG } from '../constants/config.js';
import { logger } from '../core/logger.js';

class GameManager {
    constructor() {
        this.activeGames = new Collection();
        this.gameTypes = new Map();
        this.setupCleanupInterval();
    }

    /**
     * Register a game type
     * @param {string} name - Name of the game
     * @param {class} gameClass - Game class that extends GameBase
     */
    registerGame(name, gameClass) {
        this.gameTypes.set(name.toLowerCase(), gameClass);
        logger.info(`Registered game type: ${name}`);
    }

    /**
     * Create a new game instance
     * @param {string} type - Type of game to create
     * @param {Object} options - Game options
     * @returns {GameBase} New game instance
     */
    createGame(type, options = {}) {
        const GameClass = this.gameTypes.get(type.toLowerCase());
        if (!GameClass) {
            throw new Error(`Unknown game type: ${type}`);
        }

        if (this.activeGames.size >= CONFIG.GAMES.MAX_ACTIVE_GAMES) {
            throw new Error('Maximum number of active games reached');
        }

        const game = new GameClass(options);
        this.activeGames.set(game.gameId, game);

        logger.info('Created new game', {
            type,
            gameId: game.gameId,
            options
        });

        return game;
    }

    /**
     * Get an active game by ID
     * @param {string} gameId - ID of the game
     * @returns {GameBase} Game instance
     */
    getGame(gameId) {
        return this.activeGames.get(gameId);
    }

    /**
     * Get all active games in a channel
     * @param {string} channelId - Discord channel ID
     * @returns {Collection} Collection of games in the channel
     */
    getGamesInChannel(channelId) {
        return this.activeGames.filter(game => game.channelId === channelId);
    }

    /**
     * End a game and remove it from active games
     * @param {string} gameId - ID of the game to end
     * @param {string} reason - Reason for ending the game
     */
    async endGame(gameId, reason = 'completed') {
        const game = this.activeGames.get(gameId);
        if (!game) return;

        await game.endGame(reason);
        this.activeGames.delete(gameId);

        logger.info('Game ended', {
            gameId,
            reason,
            type: game.constructor.name
        });
    }

    /**
     * Clean up inactive games
     * @protected
     */
    async cleanupInactiveGames() {
        const now = Date.now();
        const timeout = CONFIG.GAMES.GAME_TIMEOUT;

        for (const [gameId, game] of this.activeGames.entries()) {
            const lastActivity = game.lastActivityTime || game.startTime;
            if (now - lastActivity > timeout) {
                await this.endGame(gameId, 'timeout');
            }
        }
    }

    /**
     * Setup cleanup interval
     * @protected
     */
    setupCleanupInterval() {
        setInterval(() => {
            this.cleanupInactiveGames().catch(error => {
                logger.error('Game cleanup error', { error });
            });
        }, CONFIG.GAMES.CLEANUP_INTERVAL);
    }

    /**
     * Get statistics about active games
     * @returns {Object} Game statistics
     */
    getStats() {
        const stats = {
            totalGames: this.activeGames.size,
            byType: {},
            byState: {
                waiting: 0,
                active: 0,
                ended: 0
            },
            totalPlayers: 0
        };

        for (const game of this.activeGames.values()) {
            // Count by type
            const type = game.constructor.name;
            stats.byType[type] = (stats.byType[type] || 0) + 1;

            // Count by state
            stats.byState[game.gameState]++;

            // Count total players
            stats.totalPlayers += game.players.size;
        }

        return stats;
    }
}

// Export singleton instance
export const gameManager = new GameManager();
