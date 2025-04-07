import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logError, logInfo } from './logger.js';
import { loadCommands } from './commands/index.js';
import { loadEvents } from './events/index.js';
import { token } from './config.js';
import path from 'path';

// Helper function to get the current log file name
function getErrorLogFileName() {
    const now = new Date();
    const date = now.toLocaleDateString('en-GB').replace(/\//g, '-'); // Format: DD-MM-YYYY
    return path.resolve('logs', 'errors', `${date}.log`); // Use absolute path
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

(async () => {
    try {
        const startTime = Date.now();
        logInfo(`Starting bot at: ${new Date(startTime).toISOString()}`);

        // Load commands
        const commandsStart = Date.now();
        const commands = await loadCommands(client);
        const commandsEnd = Date.now();
        logInfo(`Commands loaded in ${commandsEnd - commandsStart}ms`);

        // Load events
        const eventsStart = Date.now();
        const events = await loadEvents(client);
        const eventsEnd = Date.now();
        logInfo(`Events loaded in ${eventsEnd - eventsStart}ms`);

        // Log in to Discord
        const loginStart = Date.now();
        await client.login(token);
        const loginEnd = Date.now();
        logInfo(`Bot logged in successfully in ${loginEnd - loginStart}ms`);
    } catch (error) {
        const logFile = getErrorLogFileName();
        logError('Failed to start bot:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
})();

process.on('unhandledRejection', (reason) => {
    const logFile = getErrorLogFileName();
    logError('Unhandled Promise Rejection:', { reason });
    process.exit(1); // Exit the process to avoid undefined behavior
});
