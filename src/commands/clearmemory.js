import { SlashCommandBuilder } from 'discord.js';
import { memory, saveMemory } from '../utils.js';

export default {
    data: new SlashCommandBuilder()
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
        ),
    async execute(interaction) {
        const durationType = interaction.options.getString('duration_type');
        const durationValue = interaction.options.getInteger('duration_value');
        const channelId = interaction.channel.id;

        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            await interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
            return;
        }

        if (!memory[channelId]) {
            await interaction.reply({
                content: 'No memory exists for this channel.',
                ephemeral: true,
            });
            return;
        }

        if (durationValue <= 0) {
            await interaction.reply({
                content: 'Please provide a valid duration greater than 0.',
                ephemeral: true,
            });
            return;
        }

        const now = Date.now();
        const cutoff = durationType === 'days'
            ? now - durationValue * 24 * 60 * 60 * 1000
            : now - durationValue * 60 * 60 * 1000;

        memory[channelId] = memory[channelId].filter(entry => entry.timestamp >= cutoff);
        await saveMemory();

        await interaction.reply({
            content: `Memory for the past ${durationValue} ${durationType} has been cleared successfully.`,
            ephemeral: true,
        });
    },
};
