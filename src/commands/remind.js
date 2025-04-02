import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder.')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('The reminder message.')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('time')
                .setDescription('Time in minutes after which to send the reminder.')
                .setRequired(true)
        ),
    async execute(interaction) {
        const reminderMessage = interaction.options.getString('message');
        const time = interaction.options.getInteger('time');

        if (time <= 0) {
            await interaction.reply({
                content: 'Please provide a valid time greater than 0 minutes.',
                ephemeral: true,
            });
            return;
        }

        await interaction.reply({
            content: `Got it! I’ll remind you in ${time} minute(s).`,
            ephemeral: true,
        });

        setTimeout(async () => {
            await interaction.followUp({
                content: `⏰ Reminder: ${reminderMessage}`,
                ephemeral: false,
            });
        }, time * 60 * 1000);
    },
};
