import { SlashCommandBuilder } from 'discord.js';

const rateLimit = new Map(); // Track user rate limits

export default {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete a specified number of past messages in the current channel.')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('The number of past messages to delete.')
                .setRequired(true)
        ),
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const userId = interaction.user.id;
        const now = Date.now();

        // Rate limiting: 1-minute cooldown
        if (rateLimit.has(userId) && now - rateLimit.get(userId) < 60000) {
            await interaction.reply({
                content: 'You are using this command too frequently. Please wait a minute before trying again.',
                ephemeral: true,
            });
            return;
        }

        if (amount < 1 || amount > 100) {
            await interaction.reply({
                content: 'You can only delete between 1 and 100 messages.',
                ephemeral: true,
            });
            return;
        }

        try {
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            const filteredMessages = messages.filter(msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000);

            await interaction.channel.bulkDelete(filteredMessages, true);

            const failedToDelete = messages.size - filteredMessages.size;

            await interaction.reply({
                content: `Successfully deleted ${filteredMessages.size} messages.${failedToDelete > 0 ? ` ${failedToDelete} messages could not be deleted because they are older than 14 days.` : ''}`,
                ephemeral: true,
            });

            rateLimit.set(userId, now);
        } catch (error) {
            await interaction.reply({
                content: 'An error occurred while trying to delete messages. Please try again.',
                ephemeral: true,
            });
        }
    },
};
