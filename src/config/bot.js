import { GatewayIntentBits, Partials } from 'discord.js';

export const BOT_CONFIG = {
    // Core settings
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ],
    
    // Personal use configuration
    personalUse: {
        enabled: true,
        allowedGuilds: [process.env.GUILD_ID], // Only allow specific guild
        ownerOnly: true, // Only owner can add bot to servers
        ownerId: process.env.OWNER_ID,
        bio: `Personal Discord bot for iiRedPanda's server. Source code available at: https://github.com/iiRedPanda/Milena`,
        inviteLink: null // Disable public invite link
    },

    // Presence configuration
    presence: {
        status: 'online',
        activities: [
            {
                name: 'in iiRedPanda\'s server',
                type: 'PLAYING'
            }
        ]
    },

    // Command settings
    commands: {
        globalCommands: false, // Only register commands in allowed guild
        devMode: process.env.NODE_ENV !== 'production',
        registerOnStartup: true
    },

    // Performance limits
    limits: {
        maxGuilds: 1, // Only allow one guild
        maxChannelsPerGuild: 50,
        maxUsersPerGuild: 100,
        maxConcurrentGames: 5,
        maxCommandsPerMinute: 60
    },

    // Error handling
    errors: {
        notifyOwner: true,
        logToChannel: true,
        logChannelId: process.env.LOG_CHANNEL_ID
    },

    // Resource management
    resources: {
        maxMemoryUsage: 512, // MB
        maxCpuUsage: 50, // Percentage
        restartOnExceed: true
    }
};
