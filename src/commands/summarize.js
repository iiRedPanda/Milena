import { SlashCommandBuilder } from 'discord.js';
import { summarizeMessages } from '../utils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Summarize messages in the current channel.')
        .addStringOption(option =>
            option
                .setName('method')
                .setDescription('Choose how to summarize messages')
                .setRequired(true)
                .addChoices(
                    { name: 'By Message IDs', value: 'by_ids' },
                    { name: 'From Last Message', value: 'from_last' }
                )
        )
        .addStringOption(option =>
            option
                .setName('start_message_id')
                .setDescription('The ID of the starting message (required if summarizing by IDs).')
        )
        .addStringOption(option =>
            option
                .setName('end_message_id')
                .setDescription('The ID of the ending message (required if summarizing by IDs).')
        ),
    async execute(interaction) {
        const method = interaction.options.getString('method');
        const channelId = interaction.channel.id;

        if (method === 'by_ids') {
            const startMessageId = interaction.options.getString('start_message_id');
            const endMessageId = interaction.options.getString('end_message_id');

            if (!startMessageId || !endMessageId) {
                await interaction.reply({
                    content: 'You must provide both a starting and ending message ID to summarize by IDs.',
                    ephemeral: true,
                });
                return;
            }

            const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
            await interaction.reply(`Here is the summary:\n\n${summary}`);
        } else if (method === 'from_last') {
            const lastMessageId = interaction.user.lastMessageId;

            if (!lastMessageId) {
                await interaction.reply({
                    content: 'I could not find your last message in this channel.',
                    ephemeral: true,
                });
                return;
            }

            const summary = await summarizeMessages(channelId, lastMessageId, null);
            await interaction.reply(`Here is the summary from your last message:\n\n${summary}`);
        }
    },
};