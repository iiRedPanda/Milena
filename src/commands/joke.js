import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';

export default {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke to lighten the mood!'),
    async execute(interaction) {
        try {
            const response = await axios.get('https://v2.jokeapi.dev/joke/Any');
            const joke = response.data.type === 'single'
                ? response.data.joke
                : `${response.data.setup}\n\n${response.data.delivery}`;

            await interaction.reply({
                content: joke,
                ephemeral: false,
            });
        } catch (error) {
            await interaction.reply({
                content: 'Oops! I couldn’t fetch a joke right now. Please try again later.',
                ephemeral: true,
            });
        }
    },
};
