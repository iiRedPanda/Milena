const axios = require('axios');
const { logError, logInfo } = require('./logger');

async function makeGeminiRequest(context, retries = 3) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(process.env.GEMINI_API_URL, { context });
            if (response.data && response.data.candidates) {
                return response.data.candidates[0].content.parts[0].text;
            }
            throw new Error('Invalid API response');
        } catch (error) {
            if (attempt === retries) throw error;
            await delay(1000 * attempt); // Exponential backoff
        }
    }
}

module.exports = { makeGeminiRequest };