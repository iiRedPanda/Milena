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
    let errorsOccurred = false;

    try {
        // Load commands
        const commands = [];
        await loadCommands(client);
        client.commands.forEach(command => commands.push(command.data.toJSON()));

        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );

        // Load events
        await loadEvents(client);

        // Bot initialization
        client.once('ready', async () => {
            try {
                await testGeminiAPI();
                log('info', 'Bot is ready and commands are registered.');
            } catch (error) {
                logError('runtime', error);
            }
        });

        await client.login(token);
    } catch (error) {
        logError('runtime', error);
    }
})();
