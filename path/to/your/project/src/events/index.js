const { client, CHANNEL_BEHAVIOR } = require('../bot');
const { logInfo, logError } = require('../utils/logger');
const { getConfigurations, saveMemory } = require('../utils/config');
const { makeGeminiRequest } = require('../utils/api');
const { isRateLimited } = require('../utils/rateLimit');

async function setupEvents() {
    client.once('ready', () => {
        logInfo(`Logged in as ${client.user.tag}`);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.mentions.everyone) return;

        logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

        const configurations = await getConfigurations();
        const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

        // ... (rest of the message handling logic)
    });
}

module.exports = { setupEvents };