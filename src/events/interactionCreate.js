import { logError } from '../logger.js'; // Use ES module import for logger

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            logError(`Error executing command ${interaction.commandName}:`, { error });
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    }
};