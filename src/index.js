import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { logError, log } from '../botLogger.js'; // Correctly import log and logError from botLogger.js
import { loadCommands } from './commands/index.js';
import { loadEvents } from './events/index.js';
import { testGeminiAPI } from './ai.js';
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
        }

        // Load events
        try {
            await loadEvents(client);
        } catch (error) {
            errorsOccurred = true;
        }

        // Bot initialization
        client.once('ready', async () => {
            try {
                await testGeminiAPI();
            } catch (error) {
                errorsOccurred = true;
            }
        });

        await client.login(token);
    } catch (error) {
    }
})();
