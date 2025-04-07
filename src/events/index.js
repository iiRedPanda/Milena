import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logError, logInfo } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client) {
    const events = [];
    const eventFiles = (await fs.readdir(path.resolve(__dirname))).filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of eventFiles) {
        try {
            const eventPath = pathToFileURL(path.join(__dirname, file)).href;
            const event = await import(eventPath);
            if (!event.default?.name || typeof event.default.execute !== 'function') {
                logError(`Invalid event file: ${file}. Missing "name" or "execute" property.`);
                continue;
            }
            if (event.default.once) {
                client.once(event.default.name, (...args) => event.default.execute(...args, client));
            } else {
                client.on(event.default.name, (...args) => event.default.execute(...args, client));
            }
            events.push(event.default);
            logInfo(`Loaded event: ${event.default.name}`);
        } catch (error) {
            logError(`Failed to load event file: ${file}`, { error: error.message, stack: error.stack });
        }
    }

    if (events.length === 0) {
        throw new Error('No valid events were loaded. Stopping the bot.');
    }

    return events;
}