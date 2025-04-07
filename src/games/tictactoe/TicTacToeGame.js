import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { GameBase } from '../../GameBase.js';
import { logger } from '../../core/logger.js';
import { MESSAGES } from '../../constants/messages.js';
import { analytics } from '../../services/analytics.js';

const MAX_GAME_DURATION = 300000; // 5 minutes
const TURN_TIMEOUT = 30000; // 30 seconds
const MAX_GAMES_PER_USER = 3;

export class TicTacToeGame extends GameBase {
    constructor(options = {}) {
        super({
            ...options,
            minPlayers: 2,
            maxPlayers: 2,
            timeout: TURN_TIMEOUT,
            gameTimeout: MAX_GAME_DURATION,
            maxGamesPerUser: MAX_GAMES_PER_USER
        });
        
        this.board = Array(9).fill(null);
        this.symbols = ['X', 'O'];
        this.currentPlayerIndex = 0;
        this.moveHistory = [];
        this.gameStats = {
            startTime: null,
            endTime: null,
            winner: null,
            moves: 0,
            timeouts: 0
        };
    }

    async startGame(interaction, opponent) {
        if (this.gameState !== 'waiting') {
            await interaction.reply({ content: 'A game is already in progress!', ephemeral: true });
            return;
        }

        if (interaction.user.id === opponent.id) {
            await interaction.reply({ content: 'You cannot play against yourself!', ephemeral: true });
            return;
        }

        this.players.set(interaction.user.id, {
            user: interaction.user,
            symbol: this.symbols[0],
            score: 0
        });

        this.players.set(opponent.id, {
            user: opponent,
            symbol: this.symbols[1],
            score: 0
        });

        this.currentPlayerIndex = 0;
        this.gameState = 'active';
        this.gameStats.startTime = Date.now();

        const currentTurn = this.players.get(this.getCurrentPlayerId());
        await interaction.reply({
            content: `🎮 Tic Tac Toe Game Started!\n\n${this.getBoardDisplay()}\n\n${currentTurn.user}'s turn (${currentTurn.symbol})`,
            components: this.getGameComponents()
        });
    }

    async makeMove(interaction, position) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        if (interaction.user.id !== this.getCurrentPlayerId()) {
            await interaction.reply({ content: 'Not your turn!', ephemeral: true });
            return;
        }

        const row = Math.floor(position / 3);
        const column = position % 3;
        const index = row * 3 + column;

        if (this.board[index]) {
            await interaction.reply({ content: 'That position is already taken!', ephemeral: true });
            return;
        }

        const currentPlayer = this.players.get(this.getCurrentPlayerId());
        this.board[index] = currentPlayer.symbol;
        this.moveHistory.push({
            player: currentPlayer.user.id,
            position: position,
            symbol: currentPlayer.symbol
        });

        this.gameStats.moves++;

        const gameBoard = this.getBoardDisplay();
        const winner = this.checkWin();
        const isDraw = this.checkDraw();

        if (winner) {
            this.gameStats.winner = winner;
            this.gameStats.endTime = Date.now();
            this.gameState = 'finished';

            await interaction.reply({
                content: `🏆 ${winner} wins!\n\n${gameBoard}`,
                components: []
            });
            return;
        }

        if (isDraw) {
            this.gameStats.endTime = Date.now();
            this.gameState = 'finished';

            await interaction.reply({
                content: `🤝 It's a draw!\n\n${gameBoard}`,
                components: []
            });
            return;
        }

        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
        const nextPlayer = this.players.get(this.getCurrentPlayerId());

        await interaction.reply({
            content: `${gameBoard}\n\n${nextPlayer.user}'s turn (${nextPlayer.symbol})`,
            components: this.getGameComponents()
        });
    }

    getBoardDisplay() {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = this.board.slice(i * 3, (i + 1) * 3)
                .map(cell => cell || '⬜')
                .join(' | ');
            rows.push(row);
        }
        return rows.join('\n') + '\n\n1️⃣ 2️⃣ 3️⃣\n4️⃣ 5️⃣ 6️⃣\n7️⃣ 8️⃣ 9️⃣';
    }

    checkWin() {
        const winningCombinations = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        for (const combination of winningCombinations) {
            const [a, b, c] = combination;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return this.board[a];
            }
        }

        return null;
    }

    checkDraw() {
        return this.board.every(cell => cell !== null);
    }

    getCurrentPlayerId() {
        return Array.from(this.players.keys())[this.currentPlayerIndex];
    }

    getGameComponents() {
        const components = [];
        
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 3; j++) {
                const index = i * 3 + j;
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`move_${index}`)
                        .setLabel(`${index + 1}`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(this.board[index] !== null)
                );
            }
            components.push(row);
        }

        return components;
    }
}

export default TicTacToeGame;
