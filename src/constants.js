require('dotenv').config();
const { client } = require('./bot');
const { setupCommands } = require('./commands');
const { setupEvents } = require('./events');
const { logInfo, logError } = require('./utils/logger');
const { saveMemory, saveConfigurations } = require('./utils/config');

async function main() {
    try {
        await setupCommands();
        await setupEvents();
        await client.login(process.env.DISCORD_BOT_TOKEN);
        logInfo('Milena Bot is up and running!');
    } catch (error) {
        logError('Error during bot startup', error);
        process.exit(1);
    }
}

main();

process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.');
    process.exit(0);
});

const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

module.exports = { CHANNEL_BEHAVIOR };