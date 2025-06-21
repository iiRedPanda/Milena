import { memory, saveMemory } from '../utils/utils.js';
import { fetchGeminiResponse } from '../services/ai.js';
import logger from '../services/logger.js';

export default {
    name: 'messageCreate',
    async execute(message) {
        // Ignore messages from bots and messages mentioning everyone
        if (message.author.bot || message.mentions.everyone) return;

        // Log the received message
        logger.info(`Message received: "${message.content}" from ${message.author.tag} in channel ${message.channel.id}`);

        // Check if the bot is mentioned or replied to
        if (message.mentions.has(message.client.user) || message.reference) {
            const prompt = `User: ${message.content}\nAI:`;

            // Initialize memory for the channel if not already present
            memory[message.channel.id] = memory[message.channel.id] || [];
            memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

            try {
                // Fetch the response from the Gemini API
                const response = await fetchGeminiResponse(prompt);

                // Log and save the response
                memory[message.channel.id].push({ author: 'Bot', content: response, timestamp: Date.now() });
                await Promise.all([
                    saveMemory(),
                    message.reply(response),
                ]);
            } catch (error) {
                logger.error("Error processing message:", { message: error.message, stack: error.stack });
                await message.reply("An error occurred while processing your request. Please try again later.");
            }
        }
    },
};
