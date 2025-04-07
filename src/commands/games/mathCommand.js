import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { MathGame } from '../../games/math/MathGame.js';
import { logger } from '../../core/logger.js';

export default class MathCommand extends BaseCommand {
    constructor() {
        const builder = new SlashCommandBuilder()
            .setName('math')
            .setDescription('Play math games')
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('Type of math problem')
                    .addChoices(
                        { name: 'Addition', value: 'addition' },
                        { name: 'Subtraction', value: 'subtraction' },
                        { name: 'Multiplication', value: 'multiplication' },
                        { name: 'Division', value: 'division' },
                        { name: 'Exponent', value: 'exponent' }
                    )
                    .setRequired(false)
            )
            .addStringOption(option =>
                option
                    .setName('difficulty')
                    .setDescription('Difficulty level')
                    .addChoices(
                        { name: 'Easy', value: 'easy' },
                        { name: 'Medium', value: 'medium' },
                        { name: 'Hard', value: 'hard' }
                    )
                    .setRequired(false)
            );

        super({
            ...builder.toJSON(),
            requiredPermissions: [PermissionFlagsBits.SendMessages],
            cooldown: 3000
        });
    }

    async execute(interaction) {
        try {
            const mathGame = new MathGame();
            const type = interaction.options.getString('type') || 'addition';
            const difficulty = interaction.options.getString('difficulty') || 'easy';
            
            // Generate problem
            const problem = await mathGame.generateProblem(type, difficulty);
            
            // Send problem
            await interaction.reply({
                content: `Solve this problem: ${problem.question}\nTime limit: 30 seconds`,
                components: mathGame.getGameComponents()
            });
        } catch (error) {
            logger.error('Math command error:', error);
            await interaction.reply({ content: 'An error occurred while generating the problem.', ephemeral: true });
        }
    }
}
