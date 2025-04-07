import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { TicTacToeGame } from '../../games/tictactoe/TicTacToeGame.js';
import { logger } from '../../core/logger.js';

export default class TicTacToeCommand extends BaseCommand {
    constructor() {
        const builder = new SlashCommandBuilder()
            .setName('tictactoe')
            .setDescription('Play Tic Tac Toe')
            .addUserOption(option =>
                option
                    .setName('opponent')
                    .setDescription('The player to challenge')
                    .setRequired(true)
            );

        super({
            ...builder.toJSON(),
            requiredPermissions: [PermissionFlagsBits.SendMessages],
            cooldown: 5000
        });
    }

    async execute(interaction) {
        try {
            const opponent = interaction.options.getUser('opponent');
            const tictactoe = new TicTacToeGame();
            
            // Start game
            await tictactoe.startGame(interaction, opponent);
            
            // Send initial board
            await interaction.reply({
                content: `Tic Tac Toe game started! ${interaction.user} is X, ${opponent} is O. ${interaction.user} goes first.`,
                components: tictactoe.getGameComponents()
            });
        } catch (error) {
            logger.error('Tic Tac Toe command error:', error);
            await interaction.reply({ content: 'An error occurred while starting the game.', ephemeral: true });
        }
    }
}
