import axios from 'axios';
import { logError, logWarn, logInfo } from './logger.js'; // Import log functions

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
    timeout: 15000, // Increase timeout to 15 seconds
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

/**
 * Fetch response from Gemini API.
 * @param {string} prompt - The prompt to send to the Gemini API.
 * @returns {Promise<string>} - The generated response from the Gemini API.
 */
export async function fetchGeminiResponse(prompt) {
    try {
        logInfo(`Sending request to Gemini API at URL: ${currentApiUrl}`, { prompt });

        const response = await axiosInstance.post(currentApiUrl, {
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        });

        // Extract the response text
        if (response.data?.candidates?.length) {
            return response.data.candidates[0].content.parts[0].text || "I'm sorry, I couldn't understand that.";
        } else {
            throw new Error("Unexpected API response structure.");
        }
    } catch (error) {
        logError(`Error during Gemini API request: ${error.message}`, { stack: error.stack });

        // Switch to the fallback URL if the main URL fails
        if (currentApiUrl === mainApiUrl) {
            logWarn(`Switching to fallback API URL: ${fallbackApiUrl}`);
            currentApiUrl = fallbackApiUrl;
            return fetchGeminiResponse(prompt); // Retry with the fallback URL
        }

        // If fallback also fails, provide a meaningful error message
        throw new Error("Both the main and fallback Gemini API URLs failed. Please check the API configuration.");
    }
}
