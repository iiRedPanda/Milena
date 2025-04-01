const { client } = require('./bot');
const { logInfo } = require('./utils/logger');
const { getRepliedMessageContent } = require('./utils/messageUtils');
const { CHANNEL_BEHAVIOR } = require('./constants');
const { saveMemory } = require('./utils/config');

async function setupEvents() {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || message.mentions.everyone) return;

        logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

        const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;
        const isMentioned = message.mentions.has(client.user);
        const repliedMessageContent = await getRepliedMessageContent(message);

        if (
            (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
            (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
            channelBehavior === CHANNEL_BEHAVIOR.DISABLED
        ) {
            return;
        }

        const channelHistory = memory[message.channel.id] || [];
        const recentHistory = channelHistory
            .slice(-5)
            .map(entry => `${entry.author}: ${entry.content}`)
            .join('\n');

        const prompt = `Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

        if (!memory[message.channel.id]) memory[message.channel.id] = [];
        memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

        memory[message.channel.id] = memory[message.channel.id].filter(
            (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000
        );

        await saveMemory();
        await message.channel.sendTyping();

        try {
            // Call Gemini API or other processing logic
        } catch (error) {
            logError('Error processing message', error, { channelId: message.channel.id });
        }
    });
}

module.exports = { setupEvents };
