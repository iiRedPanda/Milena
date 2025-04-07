import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../core/logger.js';
import { analytics } from './analytics.js';
import { MESSAGES } from '../constants/messages.js';

export class GeminiService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is required');
        }

        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        this.logger = logger.child({ service: 'gemini' });
    }

    async processChat(message, interaction) {
        try {
            // Track the start time for performance monitoring
            const startTime = process.hrtime();

            // Generate content
            const result = await this.model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: message }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    },
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                    }
                ]
            });

            // Calculate duration
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds * 1000 + nanoseconds / 1e6;

            // Track analytics
            await analytics.trackAIInteraction({
                type: 'chat',
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                channelId: interaction.channel?.id,
                duration,
                inputLength: message.length,
                outputLength: result.response.text().length,
                success: true
            });

            return result.response.text();
        } catch (error) {
            this.logger.error('Error processing chat', { error });

            // Track error
            await analytics.trackError({
                error,
                service: 'gemini',
                userId: interaction.user?.id,
                context: {
                    guild: interaction.guild?.id,
                    channel: interaction.channel?.id
                }
            });

            throw error;
        }
    }

    async generateImage(prompt, interaction) {
        try {
            // Track the start time for performance monitoring
            const startTime = process.hrtime();

            // Generate image
            const result = await this.model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.9,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048
                }
            });

            // Calculate duration
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds * 1000 + nanoseconds / 1e6;

            // Track analytics
            await analytics.trackAIInteraction({
                type: 'image',
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                channelId: interaction.channel?.id,
                duration,
                inputLength: prompt.length,
                success: true
            });

            return result.response.text();
        } catch (error) {
            this.logger.error('Error generating image', { error });

            // Track error
            await analytics.trackError({
                error,
                service: 'gemini',
                userId: interaction.user?.id,
                context: {
                    guild: interaction.guild?.id,
                    channel: interaction.channel?.id
                }
            });

            throw error;
        }
    }
}
