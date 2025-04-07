import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const requiredEnvVars = [
    'DISCORD_BOT_TOKEN',
    'GOOGLE_API_KEY'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`${envVar} is not defined in the environment variables. Please check your .env file.`);
    }
}

// Bot Configuration
export const botConfig = {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.CLIENT_ID,
    defaultPrefix: '!',
    owners: process.env.BOT_OWNERS?.split(',') || [],
    supportServer: process.env.SUPPORT_SERVER,
    inviteUrl: process.env.BOT_INVITE_URL
};

// API Keys and External Services
export const apiConfig = {
    google: {
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-pro'
    },
    weather: {
        apiKey: process.env.WEATHER_API_KEY
    }
};

// Feature Flags and Toggles
export const featureFlags = {
    games: {
        enabled: true,
        wordchain: true,
        dungeon: true,
        hangman: true,
        mathgame: true,
        quiz: true
    },
    ai: {
        enabled: true,
        contextLength: 10,
        maxTokens: 2000
    },
    moderation: {
        enabled: true,
        automod: true,
        logDeletedMessages: true
    }
};

// Performance and Scaling
export const performanceConfig = {
    cache: {
        enabled: true,
        ttl: 3600, // 1 hour in seconds
        maxSize: 1000 // Maximum number of items
    },
    rateLimit: {
        commands: 5, // commands per user per minute
        messages: 120 // messages per user per minute
    },
    monitoring: {
        enabled: true,
        logLevel: process.env.LOG_LEVEL || 'info',
        metrics: true,
        analytics: true
    }
};

// Resource Management
export const resourceConfig = {
    storage: {
        type: 'local', // 'local' or 's3'
        path: path.join(__dirname, '../../data'),
        backupEnabled: true,
        backupInterval: 24 * 60 * 60 * 1000 // 24 hours
    },
    logs: {
        directory: path.join(__dirname, '../../logs'),
        maxFiles: 30, // days to keep logs
        format: ['json', 'csv']
    }
};

// Command Categories and Permissions
export const commandConfig = {
    categories: {
        admin: {
            name: 'Administrative',
            emoji: '⚙️',
            requiredPermissions: ['Administrator']
        },
        moderation: {
            name: 'Moderation',
            emoji: '🛡️',
            requiredPermissions: ['ModerateMembers']
        },
        games: {
            name: 'Games',
            emoji: '🎮',
            cooldown: 30
        },
        fun: {
            name: 'Fun',
            emoji: '😄',
            cooldown: 10
        },
        utility: {
            name: 'Utility',
            emoji: '🔧',
            cooldown: 5
        }
    },
    globalCooldown: 3,
    defaultPermissions: true
};

// Development and Debug
export const debugConfig = {
    enabled: process.env.NODE_ENV === 'development',
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',
    stackTraces: true,
    commandTiming: true
};

// Load custom server configurations
export async function loadServerConfigs() {
    try {
        const configPath = path.join(__dirname, '../../data/server-configs.json');
        const data = await fs.readFile(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.warn('No server-specific configurations found, using defaults');
        return {};
    }
}

// Save server-specific configurations
export async function saveServerConfig(guildId, config) {
    try {
        const configPath = path.join(__dirname, '../../data/server-configs.json');
        const configs = await loadServerConfigs();
        configs[guildId] = config;
        await fs.writeFile(configPath, JSON.stringify(configs, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save server configuration:', error);
        return false;
    }
}

// Get configuration for a specific server
export async function getServerConfig(guildId) {
    const configs = await loadServerConfigs();
    return configs[guildId] || {};
}

// Update feature flags
export async function updateFeatureFlags(flags) {
    try {
        const flagsPath = path.join(__dirname, '../../data/feature-flags.json');
        await fs.writeFile(flagsPath, JSON.stringify(flags, null, 2));
        Object.assign(featureFlags, flags);
        return true;
    } catch (error) {
        console.error('Failed to update feature flags:', error);
        return false;
    }
}

// Initialize configuration system
export async function initializeConfig() {
    try {
        // Create necessary directories
        const dirs = [
            path.join(__dirname, '../../data'),
            path.join(__dirname, '../../logs'),
            path.join(__dirname, '../../logs/debug'),
            path.join(__dirname, '../../logs/error'),
            path.join(__dirname, '../../logs/audit')
        ];

        for (const dir of dirs) {
            await fs.mkdir(dir, { recursive: true });
        }

        // Load feature flags if they exist
        try {
            const flagsPath = path.join(__dirname, '../../data/feature-flags.json');
            const flags = JSON.parse(await fs.readFile(flagsPath, 'utf8'));
            Object.assign(featureFlags, flags);
        } catch (error) {
            // If file doesn't exist, use defaults
            await fs.writeFile(
                path.join(__dirname, '../../data/feature-flags.json'),
                JSON.stringify(featureFlags, null, 2)
            );
        }

        return true;
    } catch (error) {
        console.error('Failed to initialize configuration:', error);
        return false;
    }
}
