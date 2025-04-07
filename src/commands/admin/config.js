import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { featureFlags, commandConfig, performanceConfig, getServerConfig, saveServerConfig, updateFeatureFlags } from '../../config/config.js';
import logger from '../../services/logger.js';

const CONFIG_CATEGORIES = {
    features: {
        name: 'Feature Flags',
        description: 'Enable or disable bot features',
        options: Object.keys(featureFlags)
    },
    commands: {
        name: 'Command Settings',
        description: 'Configure command permissions and cooldowns',
        options: Object.keys(commandConfig.categories)
    },
    performance: {
        name: 'Performance',
        description: 'Adjust performance-related settings',
        options: Object.keys(performanceConfig)
    },
    moderation: {
        name: 'Moderation',
        description: 'Configure moderation settings',
        options: ['automod', 'logChannel', 'muteRole']
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('View or update bot configurations')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current configuration')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Configuration category to view')
                        .addChoices(
                            ...Object.entries(CONFIG_CATEGORIES).map(([key, value]) => ({
                                name: value.name,
                                value: key
                            }))
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Update a configuration value')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Configuration category')
                        .setRequired(true)
                        .addChoices(
                            ...Object.entries(CONFIG_CATEGORIES).map(([key, value]) => ({
                                name: value.name,
                                value: key
                            }))
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('setting')
                        .setDescription('Setting to update')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('value')
                        .setDescription('New value')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset configuration to default values')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Configuration category to reset')
                        .setRequired(true)
                        .addChoices(
                            ...Object.entries(CONFIG_CATEGORIES).map(([key, value]) => ({
                                name: value.name,
                                value: key
                            }))
                        )
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const category = interaction.options.getString('category');
        
        try {
            switch (subcommand) {
                case 'view':
                    await this.handleViewConfig(interaction, category);
                    break;
                case 'set':
                    const setting = interaction.options.getString('setting');
                    const value = interaction.options.getString('value');
                    await this.handleSetConfig(interaction, category, setting, value);
                    break;
                case 'reset':
                    await this.handleResetConfig(interaction, category);
                    break;
            }
        } catch (error) {
            logger.log('error', 'Configuration command error', {
                error: error.message,
                category,
                subcommand,
                user: interaction.user.id,
                guild: interaction.guild.id
            });

            await interaction.reply({
                content: 'An error occurred while processing your request. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleViewConfig(interaction, category) {
        const guildConfig = await getServerConfig(interaction.guild.id);
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Bot Configuration')
            .setTimestamp();

        if (category) {
            const categoryInfo = CONFIG_CATEGORIES[category];
            if (!categoryInfo) {
                await interaction.reply({
                    content: 'Invalid configuration category.',
                    ephemeral: true
                });
                return;
            }

            embed.setDescription(`${categoryInfo.name} Configuration`);
            
            const configValues = this.getConfigValues(category, guildConfig);
            for (const [key, value] of Object.entries(configValues)) {
                embed.addFields({
                    name: key,
                    value: JSON.stringify(value, null, 2),
                    inline: true
                });
            }
        } else {
            // Show overview of all categories
            for (const [key, value] of Object.entries(CONFIG_CATEGORIES)) {
                embed.addFields({
                    name: value.name,
                    value: value.description,
                    inline: false
                });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleSetConfig(interaction, category, setting, value) {
        const categoryInfo = CONFIG_CATEGORIES[category];
        if (!categoryInfo) {
            await interaction.reply({
                content: 'Invalid configuration category.',
                ephemeral: true
            });
            return;
        }

        const guildConfig = await getServerConfig(interaction.guild.id);
        
        try {
            // Parse value appropriately
            const parsedValue = this.parseConfigValue(value);
            
            // Update the configuration
            if (!guildConfig[category]) {
                guildConfig[category] = {};
            }
            guildConfig[category][setting] = parsedValue;

            // Save the updated configuration
            await saveServerConfig(interaction.guild.id, guildConfig);

            // If it's a feature flag, update global flags
            if (category === 'features') {
                await updateFeatureFlags({
                    ...featureFlags,
                    [setting]: parsedValue
                });
            }

            await interaction.reply({
                content: `Configuration updated: ${category}.${setting} = ${parsedValue}`,
                ephemeral: true
            });

            logger.log('info', 'Configuration updated', {
                guild: interaction.guild.id,
                user: interaction.user.id,
                category,
                setting,
                value: parsedValue
            });
        } catch (error) {
            await interaction.reply({
                content: `Failed to update configuration: ${error.message}`,
                ephemeral: true
            });
        }
    },

    async handleResetConfig(interaction, category) {
        const categoryInfo = CONFIG_CATEGORIES[category];
        if (!categoryInfo) {
            await interaction.reply({
                content: 'Invalid configuration category.',
                ephemeral: true
            });
            return;
        }

        const guildConfig = await getServerConfig(interaction.guild.id);
        delete guildConfig[category];
        await saveServerConfig(interaction.guild.id, guildConfig);

        await interaction.reply({
            content: `Reset ${categoryInfo.name} configuration to default values.`,
            ephemeral: true
        });

        logger.log('info', 'Configuration reset', {
            guild: interaction.guild.id,
            user: interaction.user.id,
            category
        });
    },

    getConfigValues(category, guildConfig) {
        switch (category) {
            case 'features':
                return {
                    ...featureFlags,
                    ...(guildConfig.features || {})
                };
            case 'commands':
                return {
                    ...commandConfig.categories,
                    ...(guildConfig.commands || {})
                };
            case 'performance':
                return {
                    ...performanceConfig,
                    ...(guildConfig.performance || {})
                };
            case 'moderation':
                return {
                    ...featureFlags.moderation,
                    ...(guildConfig.moderation || {})
                };
            default:
                return {};
        }
    },

    parseConfigValue(value) {
        // Try to parse as boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;

        // Try to parse as number
        const num = Number(value);
        if (!isNaN(num)) return num;

        // Try to parse as JSON
        try {
            return JSON.parse(value);
        } catch {
            // Return as string if all else fails
            return value;
        }
    }
};