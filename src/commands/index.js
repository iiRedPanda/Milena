import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url'; // Import helper functions
import { logInfo, logError } from '../logger.js'; // Use ES module import for logger

const __filename = fileURLToPath(import.meta.url); // Get the current file path
const __dirname = path.dirname(__filename); // Get the directory name

export async function loadCommands(client) {
    client.commands = new Map();

    const commandFiles = fs.readdirSync(path.resolve(__dirname)).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        if (file !== 'index.js') {
            const command = await import(pathToFileURL(path.join(__dirname, file)).href); // Use pathToFileURL
            client.commands.set(command.default.name, command.default);
        }
    }
}
