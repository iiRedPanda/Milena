import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { WordChainGame } from '../../games/wordchain/WordChainGame.js';
import { logger } from '../../core/logger.js';

export default class WordChainCommand extends BaseCommand {
    constructor() {
        const builder = new SlashCommandBuilder()
            .setName('wordchain')
            .setDescription('Play Word Chain game')
            .addStringOption(option =>
                option
                    .setName('action')
                    .setDescription('Action to take')
                    .addChoices(
                        { name: 'Start', value: 'start' },
                        { name: 'Join', value: 'join' },
                        { name: 'Rules', value: 'rules' },
                        { name: 'Stats', value: 'stats' }
                    )
                    .setRequired(true)
            );

        super({
            ...builder.toJSON(),
            requiredPermissions: [PermissionFlagsBits.SendMessages],
            cooldown: 3000
        });
    }

    async execute(interaction) {
        try {
            const action = interaction.options.getString('action');
            const wordChain = new WordChainGame();
            
            switch (action) {
                case 'start':
                    await wordChain.startGame(interaction);
                    break;
                case 'join':
                    await wordChain.joinGame(interaction);
                    break;
                case 'rules':
                    await wordChain.showRules(interaction);
                    break;
                case 'stats':
                    await wordChain.showStats(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Word Chain command error:', error);
            await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
        }
    }
}
