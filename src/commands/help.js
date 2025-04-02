export default {
    name: 'help',
    description: 'List all available commands.',
    async execute(interaction) {
        const adminCommands = interaction.client.commands.filter(cmd => ['setup', 'config', 'memoryprune', 'clearmemory'].includes(cmd.data.name));
        const userCommands = interaction.client.commands.filter(cmd => !['setup', 'config', 'memoryprune', 'clearmemory'].includes(cmd.data.name));

        const helpMessage = `
        **Admin Commands:**
        ${adminCommands.map(cmd => `- \`/${cmd.data.name}\`: ${cmd.data.description}`).join('\n')}

        **User Commands:**
        ${userCommands.map(cmd => `- \`/${cmd.data.name}\`: ${cmd.data.description}`).join('\n')}
        `;
        await interaction.reply({
            content: helpMessage,
            ephemeral: true,
        });
    },
};