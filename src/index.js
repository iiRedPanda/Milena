require('dotenv').config();
const { client } = require('./bot');
const { setupCommands } = require('./commands'); // Ensure correct import
const { setupEvents } = require('./events');
const { logInfo, logError } = require('./utils/logger');
const { saveMemory, saveConfigurations } = require('./utils/config');

function validateEnvVariables(requiredVars) {
    const missingVars = requiredVars.filter((key) => !process.env[key]);
    if (missingVars.length > 0) {
        logError('Missing required environment variables', new Error('Validation Error'), { missingVars });
        process.exit(1);
    }
}

validateEnvVariables(['DISCORD_BOT_TOKEN', 'GEMINI_API_KEY', 'GEMINI_API_URL']);

async function main() {
    try {
        await setupCommands(); // Await setupCommands to ensure it completes
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
    logInfo('Milena Bot has been shut down successfully.');
    process.exit(0);
});