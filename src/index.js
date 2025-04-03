import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logError, logInfo } from './logger.js'; // Use the updated logger
import { loadCommands } from './commands/index.js';
import { loadEvents } from './events/index.js';
import { token } from './config.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

(async () => {
    try {
        logInfo('Starting bot...');
        await loadCommands(client);
        await loadEvents(client);

        await client.login(token);
        logInfo('Bot logged in successfully.');
    } catch (error) {
        logError('Failed to start the bot:', { error });
        process.exit(1); // Exit the process with an error code
    }
})();

process.on('unhandledRejection', (reason) => {
    logError('Unhandled Promise Rejection:', { reason });
    process.exit(1); // Exit the process to avoid undefined behavior
});
