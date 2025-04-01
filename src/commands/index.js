const { PermissionsBitField } = require('discord.js');
const { client } = require('../bot');
const { logError } = require('../utils/logger');
const { getConfigurations, saveConfigurations } = require('../utils/config');
const { CHANNEL_BEHAVIOR } = require('../constants');
const { hasPermission } = require('../utils/permissions');

async function handleSetupCommand(interaction) {
    const config = getConfigurations(interaction.guildId);
    if (!hasPermission(interaction.member, config, 'adminRoles')) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }

    const subCommand = interaction.options.getString('subcommand');
    if (subCommand === 'channelBehavior') {
        const channel = interaction.options.getChannel('channel');
        const behavior = interaction.options.getString('behavior');
        if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
            await interaction.reply({ content: 'Invalid behavior type.', ephemeral: true });
            return;
        }
        const behaviorMap = {
            mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
            replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
            all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
            disable: CHANNEL_BEHAVIOR.DISABLED,
        };
        config.channelBehavior[channel.id] = behaviorMap[behavior];
        await saveConfigurations();
        await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
    } else if (subCommand === 'setSummarizeEmoji') {
        const emoji = interaction.options.getString('emoji');
        config.summarizeEmoji = emoji;
        await saveConfigurations();
        await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
    } else {
        await interaction.reply({ content: 'Invalid setup subcommand.', ephemeral: true });
    }
}

async function handleHelpCommand(interaction) {
    // Implementation of help command
}

async function handleClearCommand(interaction) {
    const config = getConfigurations(interaction.guildId);
    if (!hasPermission(interaction.member, config, 'allowedRoles')) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    // Implementation of clear command
}

async function handleStatusCommand(interaction) {
    // Implementation of status command
}

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
            logError('Error handling slash command', error, { commandName: interaction.commandName });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
            }
        }
    });
}

module.exports = { setupCommands };