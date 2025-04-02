import { log, logError } from './botLogger.js'; // Use the centralized botLogger module

bot.on('message', async (message) => {
    try {
        // Ensure the bot does not process its own messages or messages without content
        if (message.author.bot || !message.content) return;

        // Log the received message
        log('message', `Message received: "${message.content}" from ${message.author.tag} in channel ${message.channel.id}`);

        // Pass the message to the memory function for processing
        await memoryFunction.processMessage(message);
    } catch (error) {
        // Log errors related to messages in the respective log folder
        logError('message', error, { user: message.author.tag, content: message.content });
    }
});
