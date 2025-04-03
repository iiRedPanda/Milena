import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import { logInfo, logError } from '../logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Get the current weather for a location.')
        .addStringOption(option =>
            option
                .setName('location')
                .setDescription('The location to get the weather for.')
                .setRequired(true)
        ),
    async execute(interaction) {
        const location = interaction.options.getString('location');
        const apiKey = process.env.OPENWEATHER_API_KEY;

        if (!location) {
            await interaction.reply({
                content: 'Please provide a valid location.',
                ephemeral: true,
            });
            return;
        }

        try {
            const response = await axios.get(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${apiKey}`
            );

            const weather = response.data.weather[0].description;
            const temp = response.data.main.temp;
            const feelsLike = response.data.main.feels_like;

            logInfo('Weather fetched successfully.', { location, weather, temp, feelsLike });

            await interaction.reply({
                content: `The current weather in ${location} is **${weather}** with a temperature of **${temp}°C** (feels like **${feelsLike}°C**).`,
                ephemeral: false,
            });
        } catch (error) {
            logError('Failed to fetch weather.', { location, error });

            await interaction.reply({
                content: 'Sorry, I couldn’t fetch the weather for that location. Please try again later.',
                ephemeral: true,
            });
        }
    },
};
