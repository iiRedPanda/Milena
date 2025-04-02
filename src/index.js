import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadCommands } from './commands/index.js';
import { loadEvents } from './events/index.js';
import { testGeminiAPI } from './ai.js';
import { logError } from './logger.js';
import { token } from './config.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

(async () => {
    let errorsOccurred = false;

    try {
        // Load commands
        try {
            await loadCommands(client);
        } catch (error) {
            errorsOccurred = true;
            logError('Error loading commands:', { message: error.message, stack: error.stack });
        }

        // Load events
        try {
            await loadEvents(client);
        } catch (error) {
            errorsOccurred = true;
            logError('Error loading events:', { message: error.message, stack: error.stack });
        }

        // Bot initialization
        client.once('ready', async () => {
            try {
                await testGeminiAPI();
            } catch (error) {
                errorsOccurred = true;
                logError('Error during API test:', { message: error.message, stack: error.stack });
            }

            // Display a simple message based on the success or failure of the startup process
            if (errorsOccurred) {
                console.log('❌ Errors occurred during startup. Check logs at logs/errors-<DATE>.log.');
            } else {
                console.log('✅ OK');
            }
        });

        await client.login(token);
    } catch (error) {
        logError('Critical error during startup process:', { message: error.message, stack: error.stack });
        console.log('❌ Critical error occurred during startup. Check logs at logs/errors-<DATE>.log.');
    }
})();
