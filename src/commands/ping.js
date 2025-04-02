export default {
    name: 'ping',
    description: 'Replies with Pong!',
    execute(message) {
        message.reply('Pong!');
    },
};
