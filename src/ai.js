import axios from 'axios';
import { logError, logWarn } from './logger.js'; // Import log functions

// Define the main and fallback API URLs
const mainApiUrl = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent";
const fallbackApiUrl = process.env.GEMINI_API_FALLBACK_URL || "https://api.gemini.com/v1/";

// Start with the main API URL
let currentApiUrl = mainApiUrl;

// Create a reusable Axios instance with pre-configured settings
const axiosInstance = axios.create({
    headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    timeout: 10000, // Increase timeout to 10 seconds
});

/**
 * Test the Gemini API to ensure it is working and verify the API key.
 */
export async function testGeminiAPI() {
    const testPrompt = "Hello, this is a test prompt to check the Gemini API.";
    const maxRetries = 3; // Number of retry attempts
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            attempt++;
            await axiosInstance.post(currentApiUrl, {
                contents: [
                    {
                        parts: [
                            {
                                text: testPrompt,
                            },
                        ],
                    },
                ],
            });
            return; // Exit the function if the request is successful
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                logWarn(`Attempt ${attempt} timed out. Retrying...`);
            } else {
                logError(`Error during Gemini API test: ${error.message}`, { stack: error.stack });
                throw error; // Rethrow non-timeout errors
            }

            // Switch to the fallback URL if the main URL fails
            if (attempt === 1 && currentApiUrl === mainApiUrl) {
                logWarn(`Switching to fallback API URL: ${fallbackApiUrl}`);
                currentApiUrl = fallbackApiUrl;
            }

            // If all retries fail, throw the error
            if (attempt >= maxRetries) {
                logError(`All ${maxRetries} attempts to connect to the Gemini API failed.`);
                throw error;
            }
        }
    }
}
