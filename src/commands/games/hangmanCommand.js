import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { HangmanGame } from '../../games/hangman/HangmanGame.js';
import { logger } from '../../core/logger.js';

export default class HangmanCommand extends BaseCommand {
    constructor() {
        const builder = new SlashCommandBuilder()
            .setName('hangman')
            .setDescription('Play a game of Hangman')
            .addStringOption(option =>
                option
                    .setName('category')
                    .setDescription('Choose a category for the words')
                    .addChoices(
                        { name: 'Animals', value: 'ANIMALS' },
                        { name: 'Fruits', value: 'FRUITS' },
                        { name: 'Countries', value: 'COUNTRIES' },
                        { name: 'Sports', value: 'SPORTS' },
                        { name: 'Food', value: 'FOOD' },
                        { name: 'Jobs', value: 'JOBS' }
                    )
                    .setRequired(false)
            );

        super({
            ...builder.toJSON(),
            requiredPermissions: [PermissionFlagsBits.SendMessages],
            cooldown: 5000
        });
    }

    async execute(interaction) {
        try {
            const hangman = new HangmanGame();
            const category = interaction.options.getString('category') || 'ANIMALS';
            
            // Start a new game
            await hangman.startGame(interaction, category);
            
            // Send initial game state
            await interaction.reply({
                content: `Hangman game started! Guess letters to reveal the word. You have ${hangman.maxGuesses} guesses left.`,
                components: hangman.getGameComponents()
            });
        } catch (error) {
            logger.error('Hangman command error:', error);
            await interaction.reply({ content: 'An error occurred while starting the game.', ephemeral: true });
        }
    }
}
