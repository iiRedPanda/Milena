import { Client, GatewayIntentBits, Partials } from 'discord.js';
import container from './services/container.js';
import config from './services/config.js';
import logger from './services/logger.js';
import analytics from './services/analytics.js';
import { handleMessage } from './core/messageHandler.js';
import { loadEvents } from './events/eventLoader.js';
import { loadCommands } from './commands/commandLoader.js';

// Initialize services
await config.initialize();
await analytics.initialize();

// Create client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

// Register client in container
container.registerFactory('client', () => client);

// Load commands and events
await loadCommands(client);
await loadEvents(client);

// Handle messages
client.on('messageCreate', handleMessage);

// Handle errors
client.on('error', error => {
    logger.log('error', 'Client error', { error: error.message });
    analytics.trackError('client', error);
});

// Login
try {
    await client.login(process.env.DISCORD_TOKEN);
    logger.log('info', 'Bot is ready!');
} catch (error) {
    logger.log('error', 'Failed to start bot', { error: error.message });
    process.exit(1);
}
