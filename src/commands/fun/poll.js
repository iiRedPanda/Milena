import { SlashCommandBuilder } from 'discord.js';
import { logInfo, logError } from '../logger.js';

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
        )
        .addIntegerOption(option =>
            option
                .setName('duration')
                .setDescription('Duration in minutes for the poll to remain open (optional).')
                .setRequired(false)
        ),
    async execute(interaction) {
        const question = interaction.options.getString('question');
        const options = interaction.options.getString('options').split(',').map(opt => opt.trim()).slice(0, 10);
        const duration = interaction.options.getInteger('duration') || 0;

        if (options.length < 2) {
            await interaction.reply({
                content: 'Please provide at least two options for the poll.',
                ephemeral: true,
            });
            return;
        }

        if (new Set(options).size !== options.length) {
            await interaction.reply({
                content: 'Poll options must be unique.',
                ephemeral: true,
            });
            return;
        }

        const pollMessage = `**${question}**\n\n${options
            .map((option, index) => `${index + 1}. ${option}`)
            .join('\n')}`;

        try {
            const message = await interaction.reply({
                content: pollMessage,
                fetchReply: true,
            });

            for (let i = 0; i < options.length; i++) {
                await message.react(`${i + 1}️⃣`);
            }

            logInfo('Poll created successfully.', { question, options });

            if (duration > 0) {
                setTimeout(async () => {
                    try {
                        const reactions = message.reactions.cache;
                        const results = options.map((option, index) => {
                            const reaction = reactions.get(`${index + 1}️⃣`);
                            return `${option}: ${reaction ? reaction.count - 1 : 0} votes`;
                        });

                        await interaction.followUp({
                            content: `The poll has closed! Here are the results:\n\n${results.join('\n')}`,
                        });

                        logInfo('Poll closed and results posted.', { question, results });
                    } catch (error) {
                        logError('Failed to close poll and post results.', { error });
                    }
                }, duration * 60 * 1000);
            }
        } catch (error) {
            logError('Failed to create a poll.', { error });

            await interaction.reply({
                content: 'An error occurred while creating the poll. Please try again later.',
                ephemeral: true,
            });
        }
    },
};
