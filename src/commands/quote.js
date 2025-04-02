import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';

export default {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get a random motivational quote.'),
    async execute(interaction) {
        try {
            const response = await axios.get('https://zenquotes.io/api/random');
            const quote = response.data[0].q;
            const author = response.data[0].a;

            await interaction.reply({
                content: `"${quote}"\n- ${author}`,
                ephemeral: false,
            });
        } catch (error) {
            await interaction.reply({
                content: 'Sorry, I couldn’t fetch a quote right now. Please try again later.',
                ephemeral: true,
            });
        }
    },
};
