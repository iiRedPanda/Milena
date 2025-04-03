import { SlashCommandBuilder } from 'discord.js';
import { logInfo, logError } from '../logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder.')
        .addIntegerOption(option =>
            option
                .setName('time')
                .setDescription('Time in minutes after which to send the reminder.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Optional message to include with the reminder.')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('dm')
                .setDescription('Send the reminder to your direct messages.')
                .setRequired(false)
        ),
    async execute(interaction) {
        const time = interaction.options.getInteger('time');
        const reminderMessage = interaction.options.getString('message') || '';
        const sendToDM = interaction.options.getBoolean('dm') || false;

        if (time <= 0 || time > 1440) {
            await interaction.reply({
                content: 'Please provide a valid time between 1 and 1440 minutes.',
                ephemeral: true,
            });
            return;
        }

        await interaction.reply({
            content: `Got it! I’ll remind you in ${time} minute(s).${sendToDM ? ' The reminder will be sent to your DMs.' : ''}`,
            ephemeral: true,
        });

        logInfo('Reminder set.', { user: interaction.user.tag, message: reminderMessage, time, sendToDM });

        setTimeout(async () => {
            try {
                const reminderContent = reminderMessage
                    ? `⏰ Here’s your reminder: ${reminderMessage}`
                    : `⏰ Here’s your reminder!`;

                if (sendToDM) {
                    const user = await interaction.client.users.fetch(interaction.user.id);
                    await user.send(reminderContent);
                } else {
                    await interaction.followUp({
                        content: `⏰ <@${interaction.user.id}>, ${reminderContent}`,
                        ephemeral: false,
                    });
                }

                logInfo('Reminder executed.', { user: interaction.user.tag, message: reminderMessage, sendToDM });
            } catch (error) {
                logError('Failed to send reminder.', { error });
                if (sendToDM) {
                    await interaction.followUp({
                        content: 'I couldn’t send the reminder to your DMs. Please make sure your DMs are open.',
                        ephemeral: true,
                    });
                }
            }
        }, time * 60 * 1000);
    },
};
