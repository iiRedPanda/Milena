import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../core/logger.js';
import { CONFIG } from '../constants/config.js';
import { MESSAGES } from '../constants/messages.js';
import { analytics } from '../services/analytics.js';

export class GameBase {
    constructor(options = {}) {
        this.players = new Map();
        this.gameState = 'waiting'; // waiting, active, ended
        this.startTime = null;
        this.endTime = null;
        this.lastActivityTime = null;
        this.timeout = options.timeout || CONFIG.GAMES.TURN_TIMEOUT;
        this.gameTimeout = options.gameTimeout || CONFIG.GAMES.GAME_TIMEOUT;
        this.minPlayers = options.minPlayers || 2;
        this.maxPlayers = options.maxPlayers || CONFIG.GAMES.MAX_PLAYERS_PER_GAME;
        this.currentRound = 0;
        this.maxRounds = options.maxRounds || 10;
        this.scores = new Map();
        this.gameId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.channelId = null;
        this.messageId = null;
        this.timeoutHandle = null;
        this.turnTimeoutHandle = null;
        this.currentTurn = null;
    }

    /**
     * Initialize a new game session
     */
    async initialize(interaction) {
        try {
            this.channelId = interaction.channelId;
            this.gameState = 'waiting';
            this.startTime = Date.now();
            this.lastActivityTime = Date.now();
            
            // Create initial game message
            const embed = this.createGameEmbed();
            const components = this.createGameControls();
            
            const message = await interaction.reply({
                embeds: [embed],
                components,
                fetchReply: true
            });
            
            this.messageId = message.id;
            this.setupTimeouts();
            
            logger.info('Game initialized', {
                gameId: this.gameId,
                type: this.constructor.name,
                channel: this.channelId
            });

            analytics.trackEvent('game_initialized', {
                gameId: this.gameId,
                type: this.constructor.name
            });

        } catch (error) {
            logger.error('Game initialization error', {
                gameId: this.gameId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Add a player to the game
     */
    addPlayer(userId, userTag) {
        if (this.gameState !== 'waiting') {
            throw new Error(MESSAGES.GAME.ALREADY_STARTED);
        }
        
        if (this.players.size >= this.maxPlayers) {
            throw new Error(MESSAGES.GAME.GAME_FULL);
        }
        
        if (this.players.has(userId)) {
            throw new Error(MESSAGES.GAME.ALREADY_IN_GAME);
        }
        
        this.players.set(userId, {
            tag: userTag,
            joinedAt: Date.now(),
            status: 'active'
        });
        
        this.scores.set(userId, 0);
        this.lastActivityTime = Date.now();

        logger.info('Player added to game', {
            gameId: this.gameId,
            userId,
            playerCount: this.players.size
        });

        analytics.trackEvent('player_joined_game', {
            gameId: this.gameId,
            type: this.constructor.name
        });
        
        return true;
    }

    /**
     * Remove a player from the game
     */
    removePlayer(userId) {
        if (this.gameState !== 'waiting') {
            throw new Error(MESSAGES.GAME.ALREADY_STARTED);
        }
        
        if (!this.players.has(userId)) {
            throw new Error(MESSAGES.GAME.NOT_IN_GAME);
        }
        
        this.players.delete(userId);
        this.scores.delete(userId);
        this.lastActivityTime = Date.now();

        logger.info('Player removed from game', {
            gameId: this.gameId,
            userId,
            playerCount: this.players.size
        });

        analytics.trackEvent('player_left_game', {
            gameId: this.gameId,
            type: this.constructor.name
        });
        
        return true;
    }

    /**
     * Start the game if conditions are met
     */
    async startGame(interaction) {
        try {
            if (this.players.size < this.minPlayers) {
                throw new Error(MESSAGES.GAME.NOT_ENOUGH_PLAYERS);
            }

            this.gameState = 'active';
            this.currentRound = 1;
            this.startTime = Date.now();
            this.lastActivityTime = Date.now();
            
            await this.updateGameMessage(interaction);
            
            logger.info('Game started', {
                gameId: this.gameId,
                players: Array.from(this.players.keys()),
                type: this.constructor.name
            });

            analytics.trackEvent('game_started', {
                gameId: this.gameId,
                type: this.constructor.name,
                playerCount: this.players.size
            });
            
            return true;

        } catch (error) {
            logger.error('Game start error', {
                gameId: this.gameId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * End the game and clean up
     */
    async endGame(interaction, reason = 'completed') {
        try {
            this.gameState = 'ended';
            this.endTime = Date.now();
            
            // Clear any active timeouts
            if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
            if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
            
            // Calculate final scores and determine winners
            const winners = this.getWinners();
            
            // Update the game message one last time
            const embed = this.createGameEmbed();
            const components = []; // No more buttons needed
            
            if (interaction) {
                await interaction.update({
                    embeds: [embed],
                    components
                });
            }
            
            logger.info('Game ended', {
                gameId: this.gameId,
                reason,
                winners,
                duration: this.endTime - this.startTime
            });

            analytics.trackEvent('game_ended', {
                gameId: this.gameId,
                type: this.constructor.name,
                reason,
                duration: this.endTime - this.startTime,
                playerCount: this.players.size,
                rounds: this.currentRound
            });
            
            return true;

        } catch (error) {
            logger.error('Game end error', {
                gameId: this.gameId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Make a move in the game
     */
    async makeMove(interaction, move) {
        if (this.gameState !== 'active') {
            throw new Error(MESSAGES.GAME.GAME_NOT_ACTIVE);
        }

        const userId = interaction.user.id;
        if (!this.players.has(userId)) {
            throw new Error(MESSAGES.GAME.NOT_IN_GAME);
        }

        if (this.currentTurn && this.currentTurn !== userId) {
            throw new Error(MESSAGES.GAME.NOT_YOUR_TURN);
        }

        if (!this.isValidMove(move)) {
            throw new Error(MESSAGES.GAME.INVALID_MOVE);
        }

        try {
            // Process the move
            await this.processMove(interaction, move);
            
            // Update activity time
            this.lastActivityTime = Date.now();
            
            // Reset turn timeout if needed
            if (this.turnTimeoutHandle) {
                clearTimeout(this.turnTimeoutHandle);
                this.setupTurnTimeout();
            }

            // Track move
            analytics.trackEvent('game_move_made', {
                gameId: this.gameId,
                type: this.constructor.name,
                round: this.currentRound
            });

            return true;

        } catch (error) {
            logger.error('Move processing error', {
                gameId: this.gameId,
                userId,
                move,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Process a move (to be implemented by child classes)
     */
    async processMove(interaction, move) {
        throw new Error('processMove must be implemented by child class');
    }

    /**
     * Check if a move is valid (to be implemented by child classes)
     */
    isValidMove(move) {
        throw new Error('isValidMove must be implemented by child class');
    }

    /**
     * Get sorted list of winners
     */
    getWinners() {
        return Array.from(this.scores.entries())
            .sort(([, a], [, b]) => b - a)
            .map(([userId, score]) => ({
                userId,
                tag: this.players.get(userId).tag,
                score
            }));
    }

    /**
     * Create game status embed
     */
    createGameEmbed() {
        const embed = new EmbedBuilder()
            .setTitle(this.getGameTitle())
            .setColor(this.getGameColor())
            .setTimestamp();

        switch (this.gameState) {
            case 'waiting':
                embed.setDescription(this.getWaitingDescription());
                break;
            case 'active':
                embed.setDescription(this.getActiveDescription());
                break;
            case 'ended':
                embed.setDescription(this.getEndedDescription());
                break;
        }

        // Add player list
        const playerList = Array.from(this.players.values())
            .map(player => `${player.tag}: ${this.scores.get(player.id) || 0} points`)
            .join('\n');
        
        embed.addFields({ name: 'Players', value: playerList || 'No players yet' });

        return embed;
    }

    /**
     * Create game control buttons
     */
    createGameControls() {
        const row = new ActionRowBuilder();

        if (this.gameState === 'waiting') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`join_${this.gameId}`)
                    .setLabel('Join Game')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`leave_${this.gameId}`)
                    .setLabel('Leave Game')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`start_${this.gameId}`)
                    .setLabel('Start Game')
                    .setStyle(ButtonStyle.Success)
            );
        }

        if (this.gameState === 'active') {
            // Add game-specific controls
            this.addGameControls(row);
        }

        return [row];
    }

    /**
     * Add game-specific controls (to be implemented by child classes)
     */
    addGameControls(row) {
        // Child classes should implement this
    }

    /**
     * Update the game message
     */
    async updateGameMessage(interaction) {
        const embed = this.createGameEmbed();
        const components = this.createGameControls();

        try {
            await interaction.update({
                embeds: [embed],
                components
            });
        } catch (error) {
            logger.error('Failed to update game message', {
                gameId: this.gameId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Setup game timeouts
     */
    setupTimeouts() {
        // Clear any existing timeouts
        if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
        if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);

        // Set game timeout
        this.timeoutHandle = setTimeout(() => {
            this.endGame(null, 'timeout').catch(error => {
                logger.error('Game timeout handling error', {
                    gameId: this.gameId,
                    error: error.message
                });
            });
        }, this.gameTimeout);

        // Set turn timeout if game is active
        if (this.gameState === 'active') {
            this.setupTurnTimeout();
        }
    }

    /**
     * Setup turn timeout
     */
    setupTurnTimeout() {
        if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);

        this.turnTimeoutHandle = setTimeout(() => {
            this.handleTurnTimeout().catch(error => {
                logger.error('Turn timeout handling error', {
                    gameId: this.gameId,
                    error: error.message
                });
            });
        }, this.timeout);
    }

    /**
     * Handle turn timeout (to be implemented by child classes)
     */
    async handleTurnTimeout() {
        throw new Error('handleTurnTimeout must be implemented by child class');
    }

    // Virtual methods to be implemented by child classes
    getGameTitle() { throw new Error('getGameTitle must be implemented by child class'); }
    getGameColor() { throw new Error('getGameColor must be implemented by child class'); }
    getWaitingDescription() { throw new Error('getWaitingDescription must be implemented by child class'); }
    getActiveDescription() { throw new Error('getActiveDescription must be implemented by child class'); }
    getEndedDescription() { throw new Error('getEndedDescription must be implemented by child class'); }
}
