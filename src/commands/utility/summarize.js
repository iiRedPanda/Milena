import { PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { summarizeMessages } from '../../utils/summarizer.js';
import { fetchGeminiResponse } from '../../services/ai.js';
import { logger } from '../../core/logger.js';
import { MESSAGES } from '../../constants/messages.js';

class SummarizeCommand extends BaseCommand {
    constructor() {
        const builder = BaseCommand.createBuilder()
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
            )
            .addIntegerOption(option =>
                option
                    .setName('message_count')
                    .setDescription('Number of messages to summarize (for from_last method)')
                    .setMinValue(2)
                    .setMaxValue(100)
            );

        super({
            ...builder.toJSON(),
            permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            category: 'utility',
            cooldown: 30
        });
    }

    async fallbackSummarization(messages) {
        return messages.map(msg => `${msg.author.tag}: ${msg.content}`).join('\n').slice(0, 2000);
    }

    async run(interaction) {
        await interaction.deferReply();
        
        const method = interaction.options.getString('method');
        const channelId = interaction.channel.id;

        try {
            let messages;
            if (method === 'by_ids') {
                const startMessageId = interaction.options.getString('start_message_id');
                const endMessageId = interaction.options.getString('end_message_id');

                if (!startMessageId || !endMessageId) {
                    await interaction.editReply({
                        content: MESSAGES.ERROR.MISSING_MESSAGE_IDS,
                        ephemeral: true
                    });
                    return;
                }

                messages = await interaction.channel.messages.fetch({ 
                    after: startMessageId, 
                    before: endMessageId,
                    limit: 100
                });
            } else {
                const messageCount = interaction.options.getInteger('message_count') || 50;
                messages = await interaction.channel.messages.fetch({ 
                    limit: messageCount 
                });
            }

            if (!messages.size) {
                await interaction.editReply({
                    content: MESSAGES.ERROR.NO_MESSAGES_TO_SUMMARIZE,
                    ephemeral: true
                });
                return;
            }

            let summary;
            try {
                summary = await summarizeMessages(messages);
            } catch (error) {
                logger.warn('AI summarization failed, using fallback', { error });
                summary = await this.fallbackSummarization(messages);
            }

            await interaction.editReply({
                content: `Summary of ${messages.size} messages:\n\n${summary}`,
                ephemeral: false
            });

        } catch (error) {
            logger.error('Summarize command error', {
                channelId,
                method,
                error: error.message
            });

            await interaction.editReply({
                content: MESSAGES.ERROR.GENERAL_ERROR,
                ephemeral: true
            });
        }
    }
}

export default new SummarizeCommand();