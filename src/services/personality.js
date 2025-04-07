import fs from 'fs/promises';
import path from 'path';
import { log } from './logger.js';

class PersonalitySystem {
    constructor() {
        this.personalities = {
            default: {
                name: 'Milena',
                description: 'A helpful and friendly AI assistant',
                traits: ['helpful', 'friendly', 'professional'],
                style: 'casual',
                background: 'An AI created to assist and engage with users',
                tone: 'warm and welcoming',
                interests: ['helping users', 'learning new things', 'problem-solving'],
                emoji: '🤖',
                contextRules: [],
                adaptiveResponses: true,
                channelSpecific: false
            }
        };
        this.activePersonality = 'default';
        this.customPersonalities = new Map();
        this.channelPersonalities = new Map();
        this.contextMemory = new Map();
        this.loadPersonalities();
    }

    async loadPersonalities() {
        try {
            const configPath = path.join(process.cwd(), 'data', 'personalities.json');
            const data = await fs.readFile(configPath, 'utf8');
            const parsed = JSON.parse(data);
            
            this.customPersonalities = new Map(Object.entries(parsed.personalities || {}));
            this.channelPersonalities = new Map(Object.entries(parsed.channelMappings || {}));
            this.contextMemory = new Map(Object.entries(parsed.contextMemory || {}));
            
            // Clean up old context memory
            this.cleanContextMemory();
        } catch (error) {
            log('info', 'No custom personalities found');
        }
    }

    async savePersonalities() {
        try {
            const configPath = path.join(process.cwd(), 'data', 'personalities.json');
            await fs.mkdir(path.dirname(configPath), { recursive: true });
            
            const data = {
                personalities: Object.fromEntries(this.customPersonalities),
                channelMappings: Object.fromEntries(this.channelPersonalities),
                contextMemory: Object.fromEntries(this.contextMemory)
            };
            
            await fs.writeFile(configPath, JSON.stringify(data, null, 2));
        } catch (error) {
            log('error', 'Failed to save personalities', { error: error.message });
        }
    }

    cleanContextMemory() {
        const now = Date.now();
        for (const [key, data] of this.contextMemory.entries()) {
            if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
                this.contextMemory.delete(key);
            }
        }
    }

    getPersonality(name = this.activePersonality) {
        return this.customPersonalities.get(name) || this.personalities[name];
    }

    getChannelPersonality(channelId) {
        const channelPersonality = this.channelPersonalities.get(channelId);
        return channelPersonality ? this.getPersonality(channelPersonality) : this.getPersonality();
    }

    async setChannelPersonality(channelId, personalityName) {
        if (this.personalities[personalityName] || this.customPersonalities.has(personalityName)) {
            this.channelPersonalities.set(channelId, personalityName);
            await this.savePersonalities();
            return true;
        }
        return false;
    }

    async clearChannelPersonality(channelId) {
        this.channelPersonalities.delete(channelId);
        await this.savePersonalities();
    }

    async createPersonality(name, data) {
        if (this.personalities[name] || this.customPersonalities.has(name)) {
            return false;
        }

        // Enhanced validation
        const required = ['description', 'traits', 'style', 'background', 'tone'];
        if (!required.every(key => data[key])) {
            return false;
        }

        // Sanitize and structure the personality with advanced features
        const personality = {
            name,
            description: data.description.slice(0, 200),
            traits: data.traits.slice(0, 5),
            style: data.style,
            background: data.background.slice(0, 300),
            tone: data.tone,
            interests: (data.interests || []).slice(0, 5),
            emoji: data.emoji || '🤖',
            contextRules: data.contextRules || [],
            adaptiveResponses: data.adaptiveResponses !== false,
            channelSpecific: data.channelSpecific || false,
            responsePatterns: data.responsePatterns || [],
            moodInfluence: data.moodInfluence || 0.5,
            learningRate: data.learningRate || 0.1
        };

        this.customPersonalities.set(name, personality);
        await this.savePersonalities();
        return true;
    }

    updateContext(channelId, context) {
        this.contextMemory.set(channelId, {
            context,
            timestamp: Date.now()
        });
    }

    getContext(channelId) {
        return this.contextMemory.get(channelId)?.context;
    }

    enhancePrompt(prompt, channelId = null) {
        const personality = channelId ? 
            this.getChannelPersonality(channelId) : 
            this.getCurrentPersonality();

        const context = this.getContext(channelId);
        
        let enhancedPrompt = `As ${personality.name}, ${personality.description}. 
Your tone is ${personality.tone} and your style is ${personality.style}. 
Background: ${personality.background}`;

        // Add context rules if any
        if (personality.contextRules?.length > 0) {
            enhancedPrompt += `\n\nFollow these specific rules:\n${personality.contextRules.join('\n')}`;
        }

        // Add conversation context if available
        if (context) {
            enhancedPrompt += `\n\nConversation context: ${context}`;
        }

        // Add mood influence if enabled
        if (personality.moodInfluence > 0) {
            const mood = this.calculateMood(channelId);
            enhancedPrompt += `\n\nCurrent interaction mood: ${mood}`;
        }

        enhancedPrompt += `\n\nUser message: ${prompt}`;

        return enhancedPrompt;
    }

    calculateMood(channelId) {
        const context = this.getContext(channelId);
        if (!context?.recentInteractions) return 'neutral';

        // Calculate mood based on recent interactions
        const sentimentScores = context.recentInteractions.map(i => i.sentiment);
        const averageSentiment = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;

        if (averageSentiment > 0.5) return 'positive';
        if (averageSentiment < -0.5) return 'negative';
        return 'neutral';
    }

    adaptResponse(response, channelId) {
        const personality = this.getChannelPersonality(channelId);
        if (!personality.adaptiveResponses) return response;

        const context = this.getContext(channelId);
        if (!context) return response;

        // Apply personality-specific adaptations
        let adaptedResponse = response;

        // Apply response patterns
        if (personality.responsePatterns?.length > 0) {
            for (const pattern of personality.responsePatterns) {
                if (pattern.condition(context)) {
                    adaptedResponse = pattern.transform(adaptedResponse);
                }
            }
        }

        // Apply mood influence
        if (personality.moodInfluence > 0) {
            const mood = this.calculateMood(channelId);
            adaptedResponse = this.applyMoodInfluence(adaptedResponse, mood, personality.moodInfluence);
        }

        return adaptedResponse;
    }

    applyMoodInfluence(response, mood, influence) {
        const moodPatterns = {
            positive: {
                emojis: ['😊', '✨', '🌟', '💫', '🎉'],
                phrases: ['Great!', 'Wonderful!', 'Excellent!']
            },
            negative: {
                emojis: ['🤔', '💭', '📝', '🤝'],
                phrases: ['I understand.', 'Let\'s work through this.', 'We can figure this out.']
            },
            neutral: {
                emojis: ['💡', '✨', '📝'],
                phrases: ['I see.', 'Interesting.', 'Got it.']
            }
        };

        const patterns = moodPatterns[mood];
        if (Math.random() < influence) {
            const emoji = patterns.emojis[Math.floor(Math.random() * patterns.emojis.length)];
            const phrase = patterns.phrases[Math.floor(Math.random() * patterns.phrases.length)];
            
            if (Math.random() < 0.5) {
                response = `${emoji} ${response}`;
            } else {
                response = `${phrase} ${response}`;
            }
        }

        return response;
    }

    getPersonalityEmbed() {
        const personality = this.getCurrentPersonality();
        return {
            title: `${personality.emoji} ${personality.name}'s Personality`,
            description: personality.description,
            fields: [
                {
                    name: 'Traits',
                    value: personality.traits.join(', '),
                    inline: true
                },
                {
                    name: 'Style',
                    value: personality.style,
                    inline: true
                },
                {
                    name: 'Tone',
                    value: personality.tone,
                    inline: true
                },
                {
                    name: 'Background',
                    value: personality.background
                },
                {
                    name: 'Interests',
                    value: personality.interests.join(', ') || 'None specified',
                    inline: true
                },
                {
                    name: 'Features',
                    value: [
                        personality.adaptiveResponses ? '✅ Adaptive Responses' : '❌ Adaptive Responses',
                        personality.channelSpecific ? '✅ Channel Specific' : '❌ Channel Specific',
                        `🎭 Mood Influence: ${Math.round(personality.moodInfluence * 100)}%`,
                        `📚 Learning Rate: ${Math.round(personality.learningRate * 100)}%`
                    ].join('\n'),
                    inline: true
                }
            ],
            color: 0x3498db
        };
    }
}

const personality = new PersonalitySystem();
export default personality;
