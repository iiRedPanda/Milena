import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import { logInfo, logError } from '../logger.js';
import { fetchGeminiResponse } from '../ai.js';

const fallbackJokes = [
    "Why don’t skeletons fight each other? They don’t have the guts.",
    "Why did the scarecrow win an award? Because he was outstanding in his field.",
    "Why don’t scientists trust atoms? Because they make up everything!",
];

let jokeCache = []; // Cache for jokes

export default {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke to lighten the mood!'),
    async execute(interaction) {
        try {
            // Serve from cache if available
            if (jokeCache.length > 0) {
                const cachedJoke = jokeCache.shift();
                await interaction.reply({ content: cachedJoke, ephemeral: false });
                return;
            }

            const response = await axios.get('https://v2.jokeapi.dev/joke/Any');
            const joke = response.data.type === 'single'
                ? response.data.joke
                : `${response.data.setup}\n\n${response.data.delivery}`;

            logInfo('Joke fetched successfully.', { joke });

            // Add to cache
            jokeCache.push(joke);

            await interaction.reply({ content: joke, ephemeral: false });
        } catch (error) {
            logError('Failed to fetch a joke from the API.', { error });

            try {
                const geminiJoke = await fetchGeminiResponse("Generate a funny joke.");
                await interaction.reply({ content: geminiJoke, ephemeral: false });
            } catch (geminiError) {
                logError('Failed to fetch a joke from Gemini API.', { geminiError });

                const fallback = fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
                await interaction.reply({ content: fallback, ephemeral: false });
            }
        }
    },
};
