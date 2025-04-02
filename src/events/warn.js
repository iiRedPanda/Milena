import logger from '../logger.js'; // Replace require with import

export default {
    name: 'warn', // Ensure the name is defined
    /**
     * Handle warning events from Discord.js.
     * @param {string} warning - The warning message.
     */
    execute(warning) {
        logger.warn(`Discord.js warning: ${warning}`);
    }
};