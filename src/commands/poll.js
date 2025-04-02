import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll for users to vote.')
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('The poll question.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('options')
                .setDescription('Comma-separated options for the poll (max 10).')
                .setRequired(true)
        ),
    async execute(interaction) {
        const question = interaction.options.getString('question');
        const options = interaction.options.getString('options').split(',').slice(0, 10);

        if (options.length < 2) {
            await interaction.reply({
                content: 'Please provide at least two options for the poll.',
                ephemeral: true,
            });
            return;
        }

        const pollMessage = `**${question}**\n\n${options
            .map((option, index) => `${index + 1}. ${option.trim()}`)
            .join('\n')}`;

        const message = await interaction.reply({
            content: pollMessage,
            fetchReply: true,
        });

        for (let i = 0; i < options.length; i++) {
            await message.react(`${i + 1}️⃣`);
        }
    },
};
