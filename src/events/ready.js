import client from '../client.js';
import { testGeminiAPI } from '../ai.js';
import { logInfo, logger } from '../logger.js'; // Use ES module import for logger

export default {
    name: 'ready',
    once: true,
    async execute() {
        logInfo('Bot is ready and connected.');
        try {
            await testGeminiAPI();
        } catch (error) {
            logger.error('Error during Gemini API test:', { message: error.message, stack: error.stack });
        }
    },
};