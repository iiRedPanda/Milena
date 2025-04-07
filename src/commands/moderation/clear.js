import { SlashCommandBuilder } from '@discordjs/builders';
import { log } from '../../services/logger.js';
import { memory, saveMemory } from '../../utils/utils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the conversation memory for the current channel')
        .setDefaultMemberPermissions('MANAGE_MESSAGES'),

    async execute(interaction) {
        try {
            const startTime = performance.now();
            
            // Check if the user has permission
            if (!interaction.memberPermissions.has('MANAGE_MESSAGES')) {
                await interaction.reply({
                    content: 'You need the Manage Messages permission to use this command.',
                    ephemeral: true
                });
                return;
            }

            // Clear the memory for the current channel
            memory.delete(interaction.channelId);
            
            // Save changes asynchronously
            await Promise.all([
                saveMemory(),
                interaction.reply({
                    content: 'Conversation memory has been cleared for this channel.',
                    ephemeral: true
                })
            ]);

            const duration = performance.now() - startTime;
            log('info', `Clear command executed`, {
                channel: interaction.channelId,
                user: interaction.user.tag,
                duration: `${Math.round(duration)}ms`
            });

        } catch (error) {
            log('error', 'Failed to execute clear command', {
                error: error.message,
                stack: error.stack,
                channel: interaction.channelId,
                user: interaction.user.tag
            });

            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Failed to clear the conversation memory. Please try again later.',
                    ephemeral: true
                });
            }
        }
    }
};