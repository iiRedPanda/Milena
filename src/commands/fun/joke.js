import axios from 'axios';
import { BaseCommand } from '../../core/BaseCommand.js';
import { logger } from '../../core/logger.js';
import { MESSAGES } from '../../constants/messages.js';
import { analytics } from '../../services/analytics.js';

const JOKE_API_URL = 'https://v2.jokeapi.dev/joke/Programming';
const BLACKLIST_FLAGS = ['nsfw', 'religious', 'political', 'racist', 'sexist', 'explicit'];
const MAX_CACHE_SIZE = 10;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const API_TIMEOUT = 5000; // 5 seconds

export class JokeCommand extends BaseCommand {
    constructor() {
        super({
            name: 'joke',
            description: 'Get a random programming joke',
            cooldown: 5,
            ownerOnly: false,
            guildOnly: false,
            permissions: [],
            options: []
        });
        this.jokeCache = [];
        this.setupCacheCleanup();
    }

    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            this.jokeCache = this.jokeCache.filter(joke => now - joke.timestamp < CACHE_EXPIRY);
        }, CACHE_EXPIRY);
    }

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: false });

            // Try to get a joke from cache first
            const cachedJoke = this.getCachedJoke();
            if (cachedJoke) {
                await interaction.editReply({
                    content: cachedJoke.text,
                    ephemeral: false
                });
                return;
            }

            // Fetch a new joke with timeout
            const response = await axios.get(JOKE_API_URL, {
                timeout: API_TIMEOUT,
                validateStatus: status => status >= 200 && status < 300
            });

            const joke = response.data;

            // Validate joke response
            if (joke.error) {
                throw new Error(joke.error);
            }

            if (!joke.setup || !joke.delivery) {
                throw new Error('Invalid joke response received');
            }

            // Check for blacklisted flags
            if (joke.flags && BLACKLIST_FLAGS.some(flag => joke.flags[flag])) {
                throw new Error('Joke contains inappropriate content');
            }

            // Format and send joke
            const jokeText = `${joke.setup}\n${joke.delivery}`;
            
            // Cache the joke with timestamp
            this.cacheJoke(jokeText);

            await interaction.editReply({
                content: jokeText,
                ephemeral: false
            });

            // Track command usage
            analytics.trackCommandExecution(this.name, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                success: true
            });

        } catch (error) {
            logger.error('Joke command error', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            // Track error
            analytics.trackError({
                error,
                service: 'command',
                command: this.name,
                userId: interaction.user.id,
                context: {
                    guildId: interaction.guildId,
                    channelId: interaction.channelId
                }
            });

            // Handle different error types
            if (error.name === 'TimeoutError') {
                await interaction.editReply({
                    content: MESSAGES.ERROR.API_TIMEOUT,
                    ephemeral: true
                });
            } else if (error.name === 'AxiosError') {
                await interaction.editReply({
                    content: MESSAGES.ERROR.API_ERROR,
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: MESSAGES.ERROR.COMMAND_FAILED,
                    ephemeral: true
                });
            }

            // Track failed command execution
            analytics.trackCommandExecution(this.name, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                success: false
            });
        }
    }

    getCachedJoke() {
        if (this.jokeCache.length === 0) return null;
        const index = Math.floor(Math.random() * this.jokeCache.length);
        return this.jokeCache[index];
    }

    cacheJoke(text) {
        const joke = {
            text,
            timestamp: Date.now()
        };

        // Remove oldest joke if cache is full
        if (this.jokeCache.length >= MAX_CACHE_SIZE) {
            this.jokeCache.shift();
        }

        this.jokeCache.push(joke);
    }
}
