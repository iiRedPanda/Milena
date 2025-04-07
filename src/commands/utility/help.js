import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import helpSystem from '../../services/helpSystem.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with bot commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed help for a specific command')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('category')
                .setDescription('View all commands in a category')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search for commands')
                .setRequired(false)),

    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const category = interaction.options.getString('category');
        const search = interaction.options.getString('search');

        // Handle command-specific help
        if (commandName) {
            const embed = helpSystem.getCommandHelpEmbed(commandName);
            if (!embed) {
                await interaction.reply({
                    content: `Command \`${commandName}\` not found.`,
                    ephemeral: true
                });
                return;
            }

            const tutorial = helpSystem.getCommandTutorial(commandName);
            const row = new ActionRowBuilder();

            if (tutorial) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`help_tutorial_${commandName}`)
                        .setLabel('Start Tutorial')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            await interaction.reply({
                embeds: [embed],
                components: tutorial ? [row] : [],
                ephemeral: true
            });
            return;
        }

        // Handle category-specific help
        if (category) {
            const embed = helpSystem.getCategoryHelpEmbed(category);
            if (!embed) {
                await interaction.reply({
                    content: `Category \`${category}\` not found.`,
                    ephemeral: true
                });
                return;
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
            return;
        }

        // Handle search
        if (search) {
            const results = helpSystem.searchCommands(search);
            if (results.length === 0) {
                await interaction.reply({
                    content: `No commands found matching \`${search}\`.`,
                    ephemeral: true
                });
                return;
            }

            const embed = {
                title: `🔍 Search Results: "${search}"`,
                description: `Found ${results.length} command(s):`,
                fields: results.map(cmd => ({
                    name: cmd.name,
                    value: cmd.description
                })),
                color: 0x2ECC71
            };

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
            return;
        }

        // Show main help menu
        const embed = helpSystem.getMainHelpEmbed();
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('help_refresh')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('help_search')
                    .setLabel('Search')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return;

        const { customId } = interaction;

        if (customId === 'help_refresh') {
            const embed = helpSystem.getMainHelpEmbed();
            await interaction.update({
                embeds: [embed]
            });
            return;
        }

        if (customId === 'help_search') {
            // Show search modal
            await interaction.showModal({
                title: 'Search Commands',
                customId: 'help_search_modal',
                components: [{
                    type: 1,
                    components: [{
                        type: 4,
                        customId: 'search_query',
                        label: 'What are you looking for?',
                        style: 1,
                        minLength: 2,
                        maxLength: 100,
                        placeholder: 'Enter keywords...',
                        required: true
                    }]
                }]
            });
            return;
        }

        if (customId.startsWith('help_tutorial_')) {
            const commandName = customId.slice(13);
            const tutorial = helpSystem.getCommandTutorial(commandName);
            
            if (!tutorial) {
                await interaction.reply({
                    content: 'Tutorial not found.',
                    ephemeral: true
                });
                return;
            }

            // Start interactive tutorial
            await interaction.reply({
                content: `Starting tutorial for \`${commandName}\`...\\n\\n` +
                        tutorial.tutorial,
                ephemeral: true
            });
        }
    }
};