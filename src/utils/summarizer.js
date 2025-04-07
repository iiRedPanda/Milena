import { fetchGeminiResponse } from '../services/ai.js';
import { logger } from '../core/logger.js';

/**
 * Format messages for summarization
 * @param {Collection<string, Message>} messages - Collection of Discord messages
 * @returns {string} Formatted messages
 */
function formatMessages(messages) {
    return Array.from(messages.values())
        .reverse() // Show messages in chronological order
        .map(msg => {
            const content = msg.content.trim();
            if (!content) return null; // Skip empty messages
            return `${msg.author.tag} (${new Date(msg.createdTimestamp).toLocaleString()}): ${content}`;
        })
        .filter(Boolean) // Remove null entries
        .join('\n');
}

/**
 * Create a prompt for the AI model
 * @param {string} formattedMessages - Formatted message content
 * @returns {string} AI prompt
 */
function createPrompt(formattedMessages) {
    return `Please provide a concise summary of the following Discord chat conversation. 
Focus on the main topics, key points, and any decisions or conclusions reached.
Keep the summary clear and well-organized.

Conversation:
${formattedMessages}`;
}

/**
 * Summarize Discord messages using AI
 * @param {Collection<string, Message>} messages - Collection of Discord messages
 * @returns {Promise<string>} Summary of messages
 */
export async function summarizeMessages(messages) {
    try {
        const formattedMessages = formatMessages(messages);
        if (!formattedMessages) {
            throw new Error('No valid messages to summarize');
        }

        const prompt = createPrompt(formattedMessages);
        const summary = await fetchGeminiResponse(prompt);

        if (!summary) {
            throw new Error('Failed to generate summary');
        }

        return summary;

    } catch (error) {
        logger.error('Message summarization failed', {
            error: error.message,
            messageCount: messages.size
        });
        throw error;
    }
}
