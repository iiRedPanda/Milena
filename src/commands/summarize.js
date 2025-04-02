import { summarizeMessages } from '../utils.js';

export default {
    name: 'summarize',
    description: 'Summarize messages in the current channel.',
    async execute(message) {
        const channelId = message.channel.id;
        const args = message.content.split(' ').slice(1);
        const startMessageId = args[0];
        const endMessageId = args[1];
        
        // Summarize messages
        const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
        
        // Reply with the summary
        message.reply(`Here is the summary:\n\n${summary}`);
    },
};