import client from '../client.js';
import { logInfo } from '../logger.js';

export default {
    name: 'ready',
    once: true,
    async execute() {
        const startTime = Date.now();
        logInfo(`Ready event triggered at: ${new Date(startTime).toISOString()}`);

        const endTime = Date.now();
        logInfo(`Ready event processed in ${endTime - startTime}ms`);
    },
}