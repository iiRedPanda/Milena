export default {
    name: 'help',
    description: 'List all available commands.',
    execute(message) {
        const helpMessage = `
        **Available Commands:**
        - \`!setup\`: Configure bot settings.
        - \`!config\`: View or update configurations.
        - \`!clear\`: Clear memory for the current channel.
        - \`!status\`: View bot status.
        - \`!help\`: Display this help message.
        `;
        message.reply(helpMessage);
    },
};