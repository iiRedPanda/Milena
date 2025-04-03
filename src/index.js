import 'dotenv/config';
import { Client, GatewayIntentBits, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
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
    try {
        const [commands, events] = await Promise.all([
            loadCommands(client),
            loadEvents(client),
        ]);

        log('info', `Loaded ${commands.length} commands and ${events.length} events.`);
        await client.login(token);
    } catch (error) {
        logError('runtime', error);
    }
})();
