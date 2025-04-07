import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { fetchGeminiResponse } from '../../services/ai.js';
import { log } from '../../services/logger.js';
import resourceManager from '../../services/resourceManager.js';

class StoryGame {
    constructor() {
        this.activeStories = new Map();
        this.storyTimeout = 3600000; // 1 hour
        this.genrePrompts = {
            fantasy: "Include magical elements, mythical creatures, or supernatural powers",
            scifi: "Include advanced technology, space travel, or futuristic concepts",
            mystery: "Include clues, suspense, and unexpected revelations",
            adventure: "Include exploration, challenges, and exciting discoveries",
            horror: "Include suspense, tension, and eerie elements",
            comedy: "Include humor, wit, and amusing situations",
            romance: "Include relationships, emotions, and romantic elements"
        };
    }

    createStory(genre, theme) {
        return {
            title: '',
            content: [],
            participants: new Set(),
            genre,
            theme,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            votes: new Map(),
            aiSuggestions: [],
            branchPoints: [],
            currentBranch: null,
            achievements: new Map(),
            wordCount: 0,
            mood: 'neutral',
            plotPoints: []
        };
    }

    async generateSuggestion(story) {
        return resourceManager.request('GAME_LOW', async () => {
            try {
                const prompt = `Given this collaborative story in the ${story.genre} genre with the theme "${story.theme}":
                    ${story.content.map(c => c.text).join('\n')}
                    
                    ${this.genrePrompts[story.genre.toLowerCase()]}
                    Current mood: ${story.mood}
                    
                    Generate a creative and engaging suggestion for what could happen next. 
                    Keep it concise (max 2 sentences) and make it interesting with a twist or unexpected element.`;

                const suggestion = await fetchGeminiResponse(prompt);
                story.aiSuggestions.push(suggestion);
                return suggestion;
            } catch (error) {
                log('error', 'Failed to generate story suggestion', {
                    error: error.message,
                    genre: story.genre,
                    theme: story.theme
                });
                return null;
            }
        });
    }

    async analyzeMood(content) {
        return resourceManager.request('GAME_LOW', async () => {
            try {
                const prompt = `Analyze the mood of this text and respond with a single word (happy, sad, tense, mysterious, romantic, humorous, neutral):
                    "${content}"`;
                return await fetchGeminiResponse(prompt);
            } catch (error) {
                return 'neutral';
            }
        });
    }

    async generateTitle(story) {
        return resourceManager.request('GAME_NORMAL', async () => {
            try {
                const prompt = `Generate a creative and engaging title for this ${story.genre} story:
                    ${story.content.map(c => c.text).join('\n')}
                    Theme: ${story.theme}`;
                return await fetchGeminiResponse(prompt);
            } catch (error) {
                return `${story.genre} Tale: ${story.theme}`;
            }
        });
    }

    checkAchievements(story, userId) {
        const achievements = new Set();
        const userContributions = story.content.filter(c => c.author === userId);

        // Word count achievements
        const wordCount = userContributions.reduce((count, c) => 
            count + c.text.split(/\s+/).length, 0);
        
        if (wordCount >= 100) achievements.add('Wordsmith');
        if (wordCount >= 500) achievements.add('Novelist');
        if (wordCount >= 1000) achievements.add('Master Storyteller');

        // Participation achievements
        if (userContributions.length >= 5) achievements.add('Regular Contributor');
        if (userContributions.length >= 10) achievements.add('Dedicated Author');
        if (userContributions.length >= 20) achievements.add('Story Veteran');

        // Voting achievements
        const votes = Array.from(story.votes.entries())
            .filter(([, voters]) => voters.has(userId)).length;
        
        if (votes >= 5) achievements.add('Active Voter');
        if (votes >= 10) achievements.add('Democracy Enthusiast');

        return achievements;
    }

    getGameEmbed(story) {
        const embed = {
            title: story.title || `${story.genre} Story: ${story.theme}`,
            description: 'A collaborative story-writing adventure!',
            fields: [
                {
                    name: 'Genre',
                    value: story.genre,
                    inline: true
                },
                {
                    name: 'Theme',
                    value: story.theme,
                    inline: true
                },
                {
                    name: 'Mood',
                    value: story.mood.charAt(0).toUpperCase() + story.mood.slice(1),
                    inline: true
                },
                {
                    name: 'Participants',
                    value: `${story.participants.size} writers`,
                    inline: true
                },
                {
                    name: 'Word Count',
                    value: story.wordCount.toString(),
                    inline: true
                },
                {
                    name: 'Story So Far',
                    value: story.content.map(c => c.text).join('\n\n') || 'Once upon a time...'
                }
            ],
            color: this.getGenreColor(story.genre)
        };

        if (story.aiSuggestions.length > 0) {
            embed.fields.push({
                name: '💡 AI Suggestion',
                value: story.aiSuggestions[story.aiSuggestions.length - 1]
            });
        }

        // Add achievements if any
        const achievements = Array.from(story.achievements.entries())
            .map(([user, badges]) => `<@${user}>: ${Array.from(badges).join(', ')}`)
            .join('\n');

        if (achievements) {
            embed.fields.push({
                name: '🏆 Achievements',
                value: achievements
            });
        }

        return embed;
    }

    getGenreColor(genre) {
        const colors = {
            fantasy: 0x9b59b6,
            scifi: 0x3498db,
            mystery: 0x2c3e50,
            adventure: 0xe67e22,
            horror: 0xe74c3c,
            comedy: 0xf1c40f,
            romance: 0xe91e63,
            default: 0x95a5a6
        };
        return colors[genre.toLowerCase()] || colors.default;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('story')
        .setDescription('Start or join a collaborative story-writing game')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new story')
                .addStringOption(option =>
                    option
                        .setName('genre')
                        .setDescription('Story genre')
                        .addChoices(
                            { name: 'Fantasy', value: 'fantasy' },
                            { name: 'Sci-Fi', value: 'scifi' },
                            { name: 'Mystery', value: 'mystery' },
                            { name: 'Adventure', value: 'adventure' },
                            { name: 'Horror', value: 'horror' },
                            { name: 'Comedy', value: 'comedy' },
                            { name: 'Romance', value: 'romance' }
                        )
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('theme')
                        .setDescription('Story theme or prompt')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('contribute')
                .setDescription('Add to an active story')
                .addStringOption(option =>
                    option
                        .setName('content')
                        .setDescription('Your contribution to the story (max 200 chars)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('suggest')
                .setDescription('Get an AI suggestion for the story'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('branch')
                .setDescription('Create a story branch point with multiple paths')),

    category: 'FUN',
    cooldown: 10,

    game: new StoryGame(),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'start':
                    await this.startStory(interaction);
                    break;
                case 'contribute':
                    await this.contributeToStory(interaction);
                    break;
                case 'suggest':
                    await this.getSuggestion(interaction);
                    break;
                case 'branch':
                    await this.createBranch(interaction);
                    break;
            }
        } catch (error) {
            log('error', 'Story command failed', {
                error: error.message,
                stack: error.stack,
                subcommand
            });
            await interaction.reply({
                content: 'Failed to execute story command.',
                ephemeral: true
            });
        }
    },

    async startStory(interaction) {
        const genre = interaction.options.getString('genre');
        const theme = interaction.options.getString('theme');

        // Create new story
        const storyId = `${interaction.channel.id}-${Date.now()}`;
        const story = this.game.createStory(genre, theme);
        this.game.activeStories.set(storyId, story);

        // Create initial embed
        const embed = this.game.getGameEmbed(story);

        // Create action row with buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`story_contribute_${storyId}`)
                    .setLabel('Add to Story')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`story_suggest_${storyId}`)
                    .setLabel('Get Suggestion')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`story_branch_${storyId}`)
                    .setLabel('Create Branch')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({
            content: 'A new story begins...',
            embeds: [embed],
            components: [row]
        });

        // Generate initial AI suggestion
        const suggestion = await this.game.generateSuggestion(story);
        if (suggestion) {
            const updatedEmbed = this.game.getGameEmbed(story);
            await interaction.editReply({
                embeds: [updatedEmbed],
                components: [row]
            });
        }
    },

    async contributeToStory(interaction) {
        const content = interaction.options.getString('content');
        if (content.length > 200) {
            await interaction.reply({
                content: 'Your contribution is too long! Please keep it under 200 characters.',
                ephemeral: true
            });
            return;
        }

        // Find active story in channel
        const storyId = Array.from(this.game.activeStories.keys())
            .find(id => id.startsWith(interaction.channel.id));

        if (!storyId) {
            await interaction.reply({
                content: 'No active story in this channel! Start one with `/story start`',
                ephemeral: true
            });
            return;
        }

        const story = this.game.activeStories.get(storyId);
        story.content.push({
            author: interaction.user.id,
            text: content,
            timestamp: Date.now(),
            votes: 0
        });
        story.participants.add(interaction.user.id);
        story.lastUpdate = Date.now();
        story.wordCount += content.split(/\s+/).length;

        // Update mood
        const mood = await this.game.analyzeMood(content);
        story.mood = mood;

        // Check achievements
        const achievements = this.game.checkAchievements(story, interaction.user.id);
        if (achievements.size > 0) {
            story.achievements.set(interaction.user.id, achievements);
        }

        // Update story embed
        const embed = this.game.getGameEmbed(story);
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`story_contribute_${storyId}`)
                    .setLabel('Add to Story')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`story_suggest_${storyId}`)
                    .setLabel('Get Suggestion')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`story_branch_${storyId}`)
                    .setLabel('Create Branch')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({
            content: `${interaction.user} added to the story!`,
            embeds: [embed],
            components: [row]
        });

        // Generate new AI suggestion
        const suggestion = await this.game.generateSuggestion(story);
        if (suggestion) {
            const updatedEmbed = this.game.getGameEmbed(story);
            await interaction.editReply({
                embeds: [updatedEmbed],
                components: [row]
            });
        }
    },

    async getSuggestion(interaction) {
        const storyId = Array.from(this.game.activeStories.keys())
            .find(id => id.startsWith(interaction.channel.id));

        if (!storyId) {
            await interaction.reply({
                content: 'No active story in this channel!',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply();

        const story = this.game.activeStories.get(storyId);
        const suggestion = await this.game.generateSuggestion(story);

        if (suggestion) {
            const embed = this.game.getGameEmbed(story);
            await interaction.editReply({
                content: '💡 Here\'s a suggestion for what could happen next...',
                embeds: [embed]
            });
        } else {
            await interaction.editReply({
                content: 'Failed to generate a suggestion. Try again later!',
                ephemeral: true
            });
        }
    },

    async createBranch(interaction) {
        const storyId = Array.from(this.game.activeStories.keys())
            .find(id => id.startsWith(interaction.channel.id));

        if (!storyId) {
            await interaction.reply({
                content: 'No active story in this channel!',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply();

        const story = this.game.activeStories.get(storyId);
        const options = await this.game.createBranchPoint(story);

        if (options) {
            const row = new ActionRowBuilder()
                .addComponents(
                    options.map((option, index) =>
                        new ButtonBuilder()
                            .setCustomId(`story_vote_${storyId}_${index}`)
                            .setLabel(`Path ${index + 1}`)
                            .setStyle(ButtonStyle.Primary)
                    )
                );

            const embed = {
                title: '🌟 Story Branch Point!',
                description: 'Vote for the path you want the story to take:',
                fields: options.map((option, index) => ({
                    name: `Path ${index + 1}`,
                    value: option
                })),
                color: 0x9b59b6
            };

            await interaction.editReply({
                content: 'The story has reached a turning point! Vote for what happens next...',
                embeds: [embed],
                components: [row]
            });

            // Set timeout to end voting
            setTimeout(async () => {
                const branchPoint = story.branchPoints[story.branchPoints.length - 1];
                let maxVotes = 0;
                let winningPath = 0;

                branchPoint.votes.forEach((votes, path) => {
                    if (votes > maxVotes) {
                        maxVotes = votes;
                        winningPath = path;
                    }
                });

                const winningOption = options[winningPath];
                story.content.push({
                    author: 'SYSTEM',
                    text: `[The story continues...] ${winningOption}`,
                    timestamp: Date.now(),
                    votes: 0
                });

                const updatedEmbed = this.game.getGameEmbed(story);
                await interaction.editReply({
                    content: '✨ The path has been chosen!',
                    embeds: [updatedEmbed],
                    components: []
                });
            }, 60000); // 1 minute voting period
        } else {
            await interaction.editReply({
                content: 'Failed to create branch point. Try again later!',
                ephemeral: true
            });
        }
    }
};
