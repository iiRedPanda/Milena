import { log } from './logger.js';
import analytics from './analytics.js';

class AdaptiveResponse {
    constructor() {
        this.contextPatterns = new Map();
        this.userPreferences = new Map();
        this.channelContexts = new Map();
        this.initializeDefaultPatterns();
    }

    initializeDefaultPatterns() {
        // Default patterns for different contexts
        this.contextPatterns.set('greeting', {
            trigger: /hello|hi|hey|morning|afternoon|evening/i,
            responses: [
                'Hi there! How can I assist you today?',
                'Hello! What can I help you with?',
                'Hey! What brings you here today?'
            ]
        });

        this.contextPatterns.set('goodbye', {
            trigger: /bye|goodbye|see you|later/i,
            responses: [
                'Goodbye! Have a great day!',
                'See you later!',
                'Take care!'
            ]
        });

        this.contextPatterns.set('help', {
            trigger: /help|assist|support/i,
            responses: [
                'I can help you with various tasks! What would you like assistance with?',
                'How can I assist you today?',
                'What would you like help with?'
            ]
        });

        log('info', 'Initialized default response patterns', {
            count: this.contextPatterns.size
        });
    }

    updateUserPreference(userId, preference) {
        this.userPreferences.set(userId, {
            ...this.userPreferences.get(userId),
            ...preference,
            lastUpdated: Date.now()
        });
    }

    getChannelContext(channelId) {
        if (!this.channelContexts.has(channelId)) {
            this.channelContexts.set(channelId, {
                topic: null,
                lastMessages: [],
                activeUsers: new Set(),
                lastActivity: Date.now()
            });
        }
        return this.channelContexts.get(channelId);
    }

    updateChannelContext(channelId, message) {
        const context = this.getChannelContext(channelId);
        
        // Update last messages (keep last 5)
        context.lastMessages.unshift({
            content: message.content,
            author: message.author.id,
            timestamp: Date.now()
        });
        context.lastMessages = context.lastMessages.slice(0, 5);
        
        // Update active users
        context.activeUsers.add(message.author.id);
        context.lastActivity = Date.now();
        
        // Clean up old contexts periodically
        this.cleanupOldContexts();
    }

    cleanupOldContexts() {
        const now = Date.now();
        const timeout = 30 * 60 * 1000; // 30 minutes
        
        for (const [channelId, context] of this.channelContexts) {
            if (now - context.lastActivity > timeout) {
                this.channelContexts.delete(channelId);
            }
        }
    }

    async analyzeMessageContext(message) {
        try {
            // Add timeout for long-running operations
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout exceeded')), 5000);
            });

            const result = await Promise.race([
                this._analyzeMessage(message),
                timeout
            ]);

            return result;
        } catch (error) {
            log('error', 'Failed to analyze message context', {
                error: error.message,
                stack: error.stack,
                messageId: message?.id
            });
            
            // Track error
            await analytics.trackError({
                error,
                service: 'adaptive',
                userId: message?.author?.id,
                context: {
                    channelId: message?.channel?.id,
                    messageContent: message?.content?.slice(0, 100)
                }
            });

            throw error;
        }
    }

    async _analyzeMessage(message) {
        if (!message || !message.content) {
            throw new Error('Invalid message object');
        }

        // Analyze message patterns
        const patterns = [];
        for (const [trigger, pattern] of this.contextPatterns) {
            if (message.content.toLowerCase().includes(trigger.trigger.toString().toLowerCase())) {
                patterns.push(pattern);
            }
        }

        if (patterns.length === 0) {
            return null;
        }

        // Get channel context
        const context = this.getChannelContext(message.channel.id);
        
        // Update channel context
        this.updateChannelContext(message.channel.id, message);
        
        // Select appropriate response based on context
        const selectedPattern = this.selectResponse(patterns, context);
        
        // Track analytics
        await analytics.trackAdaptiveResponse({
            userId: message.author.id,
            channelId: message.channel.id,
            patternId: selectedPattern.id,
            contextType: selectedPattern.type
        });

        return selectedPattern;
    }

    selectResponse(patterns, context) {
        try {
            if (!patterns || patterns.length === 0) {
                throw new Error('No patterns available');
            }

            // Implementation remains the same
            const channelContext = context;
            const userPrefs = this.userPreferences.get(message.author.id) || {};
            
            // Analyze message patterns
            const conversationContext = channelContext.lastMessages
                .map(msg => msg.content)
                .join(' ');
            
            return {
                patterns,
                userPrefs,
                channelContext,
                conversationContext,
                messageType: this.classifyMessage(message.content)
            };
        } catch (error) {
            log('error', 'Failed to select response', {
                error: error.message,
                stack: error.stack,
                patternsCount: patterns?.length
            });
            throw error;
        }
    }

    classifyMessage(content) {
        // Simple message classification
        if (content.endsWith('?')) return 'question';
        if (content.endsWith('!')) return 'exclamation';
        if (content.toLowerCase().includes('help')) return 'help';
        if (content.toLowerCase().includes('thank')) return 'gratitude';
        return 'statement';
    }

    adaptResponse(originalResponse, context) {
        let response = originalResponse;
        
        // Apply user preferences
        if (context.userPrefs.formality === 'casual') {
            response = this.makeCasual(response);
        } else if (context.userPrefs.formality === 'formal') {
            response = this.makeFormal(response);
        }
        
        // Add context-aware elements
        if (context.patterns.length > 0) {
            response = this.applyPatterns(response, context.patterns);
        }
        
        // Add conversation continuity
        if (context.messageType === 'question') {
            response += this.generateFollowUp(context);
        }
        
        return response;
    }

    makeCasual(response) {
        // Convert formal phrases to casual ones
        const casualReplacements = {
            'I apologize': "I'm sorry",
            'certainly': 'sure',
            'however': 'but',
            'additionally': 'also',
            'assist': 'help'
        };
        
        for (const [formal, casual] of Object.entries(casualReplacements)) {
            response = response.replace(new RegExp(formal, 'gi'), casual);
        }
        
        return response;
    }

    makeFormal(response) {
        // Convert casual phrases to formal ones
        const formalReplacements = {
            "can't": 'cannot',
            "won't": 'will not',
            'gonna': 'going to',
            'wanna': 'want to',
            'yeah': 'yes'
        };
        
        for (const [casual, formal] of Object.entries(formalReplacements)) {
            response = response.replace(new RegExp(casual, 'gi'), formal);
        }
        
        return response;
    }

    applyPatterns(response, patterns) {
        for (const pattern of patterns) {
            if (pattern.responseModifier) {
                response = pattern.responseModifier(response);
            }
            if (pattern.addendum) {
                response += ` ${pattern.addendum}`;
            }
        }
        
        return response;
    }

    generateFollowUp(context) {
        const followUps = [
            "\n\nIs there anything else you'd like to know?",
            "\n\nDoes that help explain things?",
            "\n\nLet me know if you need any clarification!",
            "\n\nDo you have any other questions?"
        ];
        
        return followUps[Math.floor(Math.random() * followUps.length)];
    }

    learnFromInteraction(message, response, success) {
        // Track successful patterns
        if (success) {
            const context = this.analyzeMessageContext(message);
            context.patterns.forEach(pattern => {
                pattern.successCount = (pattern.successCount || 0) + 1;
            });
        }
        
        // Update analytics
        analytics.trackMessage(message, performance.now());
    }
}

const adaptive = new AdaptiveResponse();
export default adaptive;
