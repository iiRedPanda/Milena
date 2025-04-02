import logger from '../logger.js'; // Replace require with import
import { configurations, saveConfigurations } from '../utils.js'; // Replace require with import

export default {
    name: 'guildDelete', // Ensure the name is defined
    async execute(guild) {
        logger.warn(`Removed from guild: ${guild.name} (ID: ${guild.id}`);

        // Additional context
        logger.info(`Guild owner: ${guild.ownerId}`);
        logger.info(`Member count: ${guild.memberCount}`);

        // Perform cleanup actions
        if (configurations[guild.id]) {
            delete configurations[guild.id];
            await saveConfigurations();
            logger.info(`Removed configurations for guild: ${guild.name} (ID: ${guild.id})`);
        } else {
            logger.warn(`No configurations found for guild: ${guild.name} (ID: ${guild.id})`);
        }
    }
};

// Remove the manual event registration as it is handled dynamically in `loadEvents`
// client.on('guildDelete', (guild) => {
//     module.exports.execute(guild);
// });