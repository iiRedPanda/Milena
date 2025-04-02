import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logError } from '../logger.js'; // Use ES module import for logger

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client) {
    const eventFiles = (await fs.readdir(path.resolve(__dirname))).filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of eventFiles) {
        const eventPath = pathToFileURL(path.join(__dirname, file)).href;
        const event = await import(eventPath);
        if (event.default && event.default.name && event.default.execute) {
            client.on(event.default.name, async (...args) => {
                try {
                    await event.default.execute(...args, client);
                } catch (error) {
                    logError(`Error in event ${event.default.name}:`, { message: error.message, stack: error.stack });
                }
            });
        }
    }
}