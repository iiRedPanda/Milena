import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../services/logger.js';
import analytics from '../services/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load all events from the events directory
 */
export async function loadEvents(client) {
    try {
        const eventFiles = await fs.readdir(__dirname);
        
        for (const file of eventFiles) {
            // Skip non-js files and the loader itself
            if (!file.endsWith('.js') || file === 'eventLoader.js') continue;

            try {
                const eventPath = path.join(__dirname, file);
                const event = (await import(eventPath)).default;
                
                if (event.name && event.execute) {
                    if (event.once) {
                        client.once(event.name, (...args) => event.execute(...args));
                    } else {
                        client.on(event.name, (...args) => event.execute(...args));
                    }
                    
                    logger.log('info', `Loaded event: ${event.name}`, { file });
                }
            } catch (error) {
                logger.log('error', `Failed to load event: ${file}`, {
                    error: error.message
                });
                analytics.trackError('events', error);
            }
        }

        logger.log('info', 'All events loaded');
    } catch (error) {
        logger.log('error', 'Failed to load events', { error: error.message });
        analytics.trackError('events', error);
        throw error;
    }
}
