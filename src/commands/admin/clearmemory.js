import { PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { memory, saveMemory } from '../../utils/memory.js';
import { logger } from '../../core/logger.js';
import { MESSAGES } from '../../constants/messages.js';

class ClearMemoryCommand extends BaseCommand {
    constructor() {
        const builder = BaseCommand.createBuilder()
            .setName('clearmemory')
            .setDescription('Clear the memory for the current channel.')
            .addStringOption(option =>
                option
                    .setName('duration_type')
                    .setDescription('Choose whether to clear memory by days or hours.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Days', value: 'days' },
                        { name: 'Hours', value: 'hours' }
                    )
            )
            .addIntegerOption(option =>
                option
                    .setName('duration_value')
                    .setDescription('Specify the number of days or hours to clear.')
                    .setRequired(true)
            );

        super({
            ...builder.toJSON(),
            permissions: [PermissionFlagsBits.Administrator],
            category: 'admin',
            cooldown: 5
        });
    }

    async run(interaction) {
        const durationType = interaction.options.getString('duration_type');
        const durationValue = interaction.options.getInteger('duration_value');
        const channelId = interaction.channel.id;

        if (!memory[channelId]) {
            await interaction.reply({
                content: MESSAGES.ERROR.NO_MEMORY,
                ephemeral: true
            });
            return;
        }

        if (durationValue <= 0) {
            await interaction.reply({
                content: MESSAGES.ERROR.INVALID_DURATION,
                ephemeral: true
            });
            return;
        }

        const cutoffTime = new Date();
        if (durationType === 'days') {
            cutoffTime.setDate(cutoffTime.getDate() - durationValue);
        } else {
            cutoffTime.setHours(cutoffTime.getHours() - durationValue);
        }

        const originalLength = memory[channelId].length;
        memory[channelId] = memory[channelId].filter(msg => 
            new Date(msg.timestamp) > cutoffTime
        );

        await saveMemory();

        const clearedCount = originalLength - memory[channelId].length;
        logger.info('Memory cleared', {
            channelId,
            durationType,
            durationValue,
            clearedCount
        });

        await interaction.reply({
            content: `Cleared ${clearedCount} messages from memory older than ${durationValue} ${durationType}.`,
            ephemeral: true
        });
    }
}

export default new ClearMemoryCommand();
