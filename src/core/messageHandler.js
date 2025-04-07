import { log } from './botLogger.js';
import { processMessage } from './memoryFunction.js';
import { fetchGeminiResponse } from './src/ai.js';
import adaptive from './src/adaptive.js';
import audit from './audit.js'; // Import audit module
import analytics from './analytics.js'; // Import analytics module

const ErrorResponses = {
    API_ERROR: [
        "Oops! My AI brain needs a quick coffee break. ☕ I'll be back in a moment!",
        "Looks like my thinking cap is a bit tight. Give me a sec to adjust it!",
        "My AI neurons are doing some yoga exercises. Mind trying again in a moment? 🧘‍♂️",
    ],
    RATE_LIMIT: [
        "Whew! You're keeping me on my toes! Let me catch my breath for a second... 😅",
        "My processors need a quick breather - I'm getting too many awesome questions!",
    ],
    TOKEN_LIMIT: [
        "That's quite a conversation piece! Could you break it down into smaller bits? My memory gets fuzzy with super long messages. 🤔",
        "Oops! That message is a bit too chunky for Discord to handle. Mind splitting it up?",
    ],
    CIRCUIT_BREAKER: [
        "My AI circuits are a bit overheated. Taking a quick cool-down break! Back in a few minutes. 🌡️",
        "System's running a bit hot - taking a brief timeout to cool down. Won't be long!",
    ],
    MEMORY_FULL: [
        "My memory banks are getting pretty full! Doing a quick spring cleaning... 🧹",
        "Time for some memory maintenance! Give me a moment to tidy up my thoughts.",
    ],
    NETWORK_ERROR: [
        "Seems like my internet connection is having a dance party. 💃 I'll try again in a second!",
        "The internet gremlins are at it again! Give me a moment to shoo them away.",
    ],
    UNKNOWN_ERROR: [
        "Something unexpected happened! Don't worry, I'm noting it down and my developers will look into it. Try again in a moment?",
        "Oops! Hit a small snag. Give me a quick moment to sort this out!",
    ]
};

function getErrorResponse(error) {
    // Get the appropriate error category and a random response
    let responses;
    if (error.message?.includes('API') || error.name === 'GeminiError') {
        responses = ErrorResponses.API_ERROR;
    } else if (error.message?.includes('rate limit') || error.code === 429) {
        responses = ErrorResponses.RATE_LIMIT;
    } else if (error.message?.includes('token') || error.message?.includes('length')) {
        responses = ErrorResponses.TOKEN_LIMIT;
    } else if (error.message?.includes('circuit breaker')) {
        responses = ErrorResponses.CIRCUIT_BREAKER;
    } else if (error.message?.includes('memory')) {
        responses = ErrorResponses.MEMORY_FULL;
    } else if (error.message?.includes('network') || error.code === 'ECONNRESET') {
        responses = ErrorResponses.NETWORK_ERROR;
    } else {
        responses = ErrorResponses.UNKNOWN_ERROR;
    }

    return responses[Math.floor(Math.random() * responses.length)];
}

class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.rateLimitDelay = 1000; // 1 second between messages
        this.lastMessageTime = 0;
    }

    async add(message) {
        return new Promise((resolve, reject) => {
            this.queue.push({ message, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const { message, resolve, reject } = this.queue.shift();

        try {
            // Calculate delay needed for rate limiting
            const now = Date.now();
            const timeSinceLastMessage = now - this.lastMessageTime;
            const delay = Math.max(0, this.rateLimitDelay - timeSinceLastMessage);

            if (delay > 0) {
                await new Promise(r => setTimeout(r, delay));
            }

            const result = await messageHandler.handleMessage(message);
            this.lastMessageTime = Date.now();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.processing = false;
            this.process(); // Process next message in queue
        }
    }
}

class MessageHandler {
    constructor() {
        this.queue = new MessageQueue();
        this.setupPeriodicCleanup();
    }

    setupPeriodicCleanup() {
        // Clean up old contexts every hour
        setInterval(() => {
            adaptive.cleanupOldContexts();
        }, 60 * 60 * 1000);
    }

    async handleMessage(message) {
        const startTime = performance.now();

        try {
            // Process message content
            const content = message.content.trim();
            
            // Ignore empty messages or bot messages
            if (!content || message.author.bot) return;

            // Log the received message
            log('message', 'Processing message', {
                content: content.substring(0, 100),
                author: message.author.tag,
                channel: message.channel.id
            });

            // Update adaptive context
            adaptive.updateChannelContext(message.channel.id, message);

            // Save to memory
            await processMessage(message);

            // Generate AI response if bot is mentioned or in DM
            const shouldRespond = message.mentions.has(message.client.user) || 
                                message.channel.type === 'DM';

            if (shouldRespond) {
                try {
                    // Get message context for adaptation
                    const context = adaptive.analyzeMessageContext(message);

                    // Send typing indicator
                    await message.channel.sendTyping();

                    // Get base response from AI
                    const baseResponse = await fetchGeminiResponse(
                        this.buildPrompt(content, context)
                    );

                    // Adapt response based on context
                    const adaptedResponse = adaptive.adaptResponse(baseResponse, context);

                    // Split long responses
                    const chunks = this.splitMessage(adaptedResponse);
                    for (const chunk of chunks) {
                        await message.channel.send(chunk);
                    }

                    // Learn from successful interaction
                    adaptive.learnFromInteraction(message, adaptedResponse, true);

                    // Log successful interaction to audit
                    audit.queueAuditLog('MESSAGES', {
                        type: 'AI Response',
                        user: message.author.tag,
                        channel: message.channel.name,
                        messageLength: content.length,
                        responseLength: adaptedResponse.length,
                        duration: Math.round(performance.now() - startTime),
                        context: context.messageType
                    });

                } catch (error) {
                    // Get a friendly error message
                    const errorResponse = getErrorResponse(error);
                    
                    // Log the actual error for debugging
                    log('error', 'Failed to process message', {
                        error: error.message,
                        stack: error.stack,
                        messageId: message.id,
                        errorType: error.name
                    });

                    // Learn from failed interaction
                    adaptive.learnFromInteraction(message, errorResponse, false);

                    // Log error to audit system
                    audit.logError(error, `Message Processing: ${message.channel.name}`, 
                        this.getSuggestedSolution(error));

                    // Send the friendly message to the user
                    await message.channel.send(errorResponse);
                }
            }

            // Log performance metrics
            const duration = performance.now() - startTime;
            log('debug', 'Message processed', {
                messageId: message.id,
                duration: `${Math.round(duration)}ms`,
                responseGenerated: shouldRespond
            });

            // Log analytics data
            if (shouldRespond) {
                audit.logAnalytics({
                    type: 'Message Stats',
                    averageResponseTime: Math.round(duration),
                    messageCount: analytics.metrics.messageCount,
                    errorRate: (analytics.metrics.errors / analytics.metrics.messageCount * 100).toFixed(2) + '%',
                    activeUsers: analytics.metrics.activeUsers.size,
                    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
                });
            }

        } catch (error) {
            // This catch block handles errors in the message processing itself
            log('error', 'Message processing failed', {
                error: error.message,
                stack: error.stack,
                messageId: message.id
            });

            audit.logError(error, 'Message Handler', 
                this.getSuggestedSolution(error));

            // Only send error message if we were supposed to respond
            if (message.mentions.has(message.client.user) || message.channel.type === 'DM') {
                const errorResponse = getErrorResponse(error);
                await message.channel.send(errorResponse);
            }
        }
    }

    buildPrompt(content, context) {
        // Build a context-aware prompt
        let prompt = content;

        // Add conversation context if available
        if (context.conversationContext) {
            prompt = `Previous context: ${context.conversationContext}\n\nCurrent message: ${content}`;
        }

        // Add user preferences if available
        if (context.userPrefs.interests) {
            prompt += `\n\nConsider user interests: ${context.userPrefs.interests.join(', ')}`;
        }

        // Add channel topic if available
        if (context.channelContext.topic) {
            prompt += `\n\nChannel topic: ${context.channelContext.topic}`;
        }

        return prompt;
    }

    splitMessage(text, maxLength = 2000) {
        if (text.length <= maxLength) return [text];

        const chunks = [];
        let current = '';
        const words = text.split(' ');

        for (const word of words) {
            if ((current + word).length >= maxLength) {
                chunks.push(current.trim());
                current = word;
            } else {
                current += (current ? ' ' : '') + word;
            }
        }

        if (current) {
            chunks.push(current.trim());
        }

        return chunks;
    }

    getSuggestedSolution(error) {
        // Provide helpful solutions based on error type
        const solutions = {
            'API_ERROR': 'Check API key and rate limits. If persists, the API service might be down.',
            'RATE_LIMIT': 'Consider increasing the rate limit delay or implementing request throttling.',
            'TOKEN_LIMIT': 'Message might be too long. Try breaking it into smaller chunks.',
            'MEMORY_ERROR': 'Check memory limits and garbage collection settings.',
            'PERMISSION_ERROR': 'Verify bot permissions in the channel/server.',
            'NETWORK_ERROR': 'Check network connectivity and DNS settings.'
        };

        // Try to match error to known types
        for (const [type, solution] of Object.entries(solutions)) {
            if (error.message?.toLowerCase().includes(type.toLowerCase())) {
                return solution;
            }
        }

        return 'Check the logs for more details and consider updating error handling for this case.';
    }
}

const messageHandler = new MessageHandler();
export default messageHandler;

bot.on('message', async (message) => {
    try {
        // Ensure the bot does not process its own messages or messages without content
        if (message.author.bot || !message.content) return;

        await messageHandler.queue.add(message);
    } catch (error) {
        log('error', 'Message handling failed', {
            error: error.message,
            stack: error.stack,
            messageId: message.id
        });
    }
});
