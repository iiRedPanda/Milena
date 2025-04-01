/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
async function getRepliedMessageContent(message) {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === message.client.user.id) {
                return repliedMessage.content;
            }
        } catch (error) {
            console.error('Error fetching replied message:', error);
        }
    }
    return null;
}

module.exports = { getRepliedMessageContent };
