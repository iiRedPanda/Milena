import { SlashCommandBuilder } from 'discord.js';
import { summarizeMessages } from '../utils.js';
import { fetchGeminiResponse } from '../ai.js';

async function fallbackSummarization(messages) {
    return messages.map(msg => msg.content).join('\n').slice(0, 2000); // Simple fallback
}

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

        try {
            let summary;
            if (method === 'by_ids') {
                const startMessageId = interaction.options.getString('start_message_id');
                const endMessageId = interaction.options.getString('end_message_id');
                const messages = await interaction.channel.messages.fetch({ after: startMessageId, before: endMessageId });

                if (!messages.size) {
                    await interaction.reply({
                        content: 'No messages found to summarize.',
                        ephemeral: true,
                    });
                    return;
                }

                summary = await fetchGeminiResponse(messages.map(msg => msg.content).join('\n'));
            } else if (method === 'from_last') {
                const messages = await interaction.channel.messages.fetch({ limit: 50 });

                if (!messages.size) {
                    await interaction.reply({
                        content: 'No messages found to summarize.',
                        ephemeral: true,
                    });
                    return;
                }

                summary = await fetchGeminiResponse(messages.map(msg => msg.content).join('\n'));
            }

            await interaction.reply(`Here is the summary:\n\n${summary}`);
        } catch (error) {
            const fallbackSummary = await fallbackSummarization(messages);
            await interaction.reply(`Gemini API failed. Fallback summary:\n\n${fallbackSummary}`);
        }
    },
};