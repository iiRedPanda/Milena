const { client } = require('../bot');
const { logError } = require('../utils/logger');
const { handleSetupCommand, handleHelpCommand, handleClearCommand, handleStatusCommand } = require('./commandHandlers');

const commands = {
    setup: handleSetupCommand,
    help: handleHelpCommand,
    clear: handleClearCommand,
    status: handleStatusCommand,
};

async function setupCommands() {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isCommand()) return;

        const { commandName } = interaction;

        try {
            if (commands[commandName]) {
                await commands[commandName](interaction);
            } else {
                await interaction.reply('Unknown command.');
            }
        } catch (error) {
            logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
            }
        }
    });
}

module.exports = { setupCommands };