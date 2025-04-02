import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logInfo, logError } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCommands(client) {
    client.commands = new Map();

    const commandFiles = fs.readdirSync(path.resolve(__dirname)).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        if (file !== 'index.js') {
            try {
                const command = await import(pathToFileURL(path.join(__dirname, file)).href);
                if (!command.default?.data?.name) {
                    logError('runtime', new Error(`Command file "${file}" is missing a valid "data.name" property.`));
                    continue;
                }
                client.commands.set(command.default.data.name, command.default);
                logInfo(`Loaded command: ${command.default.data.name}`);
            } catch (error) {
                logError('runtime', error, { file });
            }
        }
    }
}
