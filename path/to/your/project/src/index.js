require('dotenv').config();
const { client } = require('./bot');
const { setupCommands } = require('./commands');
const { setupEvents } = require('./events');
const { logInfo } = require('./utils/logger');

async function main() {
    try {
        await setupCommands();
        await setupEvents();
        await client.login(process.env.DISCORD_BOT_TOKEN);
        logInfo('Milena Bot is up and running!');
    } catch (error) {
        console.error('Error during bot startup:', error);
        process.exit(1);
    }
}

main();

// Graceful shutdown
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    // Perform any cleanup operations here
    console.log('Milena Bot has been shut down successfully.');
    process.exit(0);
});