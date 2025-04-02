import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logError, logInfo } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client) {
    const eventFiles = (await fs.readdir(path.resolve(__dirname))).filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of eventFiles) {
        try {
            const eventPath = pathToFileURL(path.join(__dirname, file)).href;
            const event = await import(eventPath);
            if (!event.default?.name || !event.default?.execute) {
                logError('runtime', new Error(`Event file "${file}" is missing a valid "name" or "execute" property.`));
                continue;
            }
            client.on(event.default.name, async (...args) => {
                try {
                    await event.default.execute(...args, client);
                } catch (error) {
                    logError('runtime', error, { event: event.default.name });
                }
            });
            logInfo(`Loaded event: ${event.default.name}`);
        } catch (error) {
            logError('runtime', error, { file });
        }
    }
}