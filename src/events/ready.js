import client from '../client.js';
import { testGeminiAPI } from '../ai.js';
import logger from '../logger.js';

export default {
    name: 'ready',
    once: true,
    async execute() {
        // Remove redundant startup log generation
        try {
            await testGeminiAPI();
        } catch (error) {
            logger.error('Error during Gemini API test:', { message: error.message, stack: error.stack });
        }
    },
};