import { SlashCommandBuilder } from 'discord.js';
import { globalMemoryPruneInterval } from '../utils.js';
import { logInfo } from '../logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('memoryprune')
        .setDescription('Configure the global memory pruning interval.')
        .addStringOption(option =>
            option
                .setName('duration_type')
                .setDescription('Choose whether to prune memory by days or hours.')
                .setRequired(true)
                .addChoices(
                    { name: 'Days', value: 'days' },
                    { name: 'Hours', value: 'hours' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('duration_value')
                .setDescription('Specify the number of days or hours for pruning.')
                .setRequired(true)
        ),
    async execute(interaction) {
        const durationType = interaction.options.getString('duration_type');
        const durationValue = interaction.options.getInteger('duration_value');

        if (durationValue <= 0) {
            await interaction.reply({
                content: 'Please provide a valid duration greater than 0.',
                ephemeral: true,
            });
            return;
        }

        const intervalInHours = durationType === 'days'
            ? durationValue * 24
            : durationValue;

        globalMemoryPruneInterval = intervalInHours;

        logInfo(`Memory pruning interval updated by ${interaction.user.tag}: ${durationValue} ${durationType}`);

        await interaction.reply({
            content: `Global memory pruning interval has been set to ${durationValue} ${durationType}.`,
            ephemeral: true,
        });
    },
};
