import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import audit from '../audit.js';
import { log } from '../../botLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('audit')
        .setDescription('Manage the audit system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up audit channels')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category name for audit channels')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable the audit system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable the audit system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show audit system status')),

    category: 'ADMIN',
    cooldown: 5,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setup':
                    await this.setupAudit(interaction);
                    break;
                case 'enable':
                    await this.enableAudit(interaction);
                    break;
                case 'disable':
                    await this.disableAudit(interaction);
                    break;
                case 'status':
                    await this.showStatus(interaction);
                    break;
            }
        } catch (error) {
            log('error', 'Audit command failed', {
                error: error.message,
                stack: error.stack,
                subcommand
            });
            await interaction.reply({
                content: 'Failed to execute audit command. Check the error logs for details.',
                ephemeral: true
            });
        }
    },

    async setupAudit(interaction) {
        await interaction.deferReply();

        try {
            // Get or create category
            const categoryName = interaction.options.getString('category') || 'Bot Audit Logs';
            let category = interaction.guild.channels.cache.find(
                c => c.type === 'GUILD_CATEGORY' && c.name === categoryName
            );

            if (!category) {
                category = await interaction.guild.channels.create({
                    name: categoryName,
                    type: 'GUILD_CATEGORY',
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.guild.roles.cache.find(r => r.name === 'Admin')?.id,
                            allow: ['ViewChannel'],
                        }
                    ]
                });
            }

            // Create audit channels
            await audit.setupChannels(interaction.guild, category);

            await interaction.editReply({
                content: `✅ Audit system has been set up in category "${categoryName}"!`,
                ephemeral: true
            });

        } catch (error) {
            log('error', 'Failed to setup audit channels', {
                error: error.message,
                stack: error.stack,
                guild: interaction.guild.id
            });
            
            await interaction.editReply({
                content: 'Failed to setup audit channels. Please check the error logs.',
                ephemeral: true
            });
        }
    },

    async enableAudit(interaction) {
        if (!audit.config.channels || Object.keys(audit.config.channels).length === 0) {
            await interaction.reply({
                content: 'Please run `/audit setup` first to create the audit channels.',
                ephemeral: true
            });
            return;
        }

        audit.config.enabled = true;
        await audit.saveConfig();

        await interaction.reply({
            content: '✅ Audit system has been enabled!',
            ephemeral: true
        });
    },

    async disableAudit(interaction) {
        audit.config.enabled = false;
        await audit.saveConfig();

        await interaction.reply({
            content: '❌ Audit system has been disabled.',
            ephemeral: true
        });
    },

    async showStatus(interaction) {
        const status = {
            enabled: audit.config.enabled,
            channels: {}
        };

        // Check channel status
        for (const [category, channelId] of Object.entries(audit.config.channels)) {
            const channel = await audit.getChannel(channelId);
            status.channels[category] = channel ? '✅ Active' : '❌ Not found';
        }

        const statusEmbed = {
            color: status.enabled ? 0x00ff00 : 0xff0000,
            title: '📊 Audit System Status',
            fields: [
                {
                    name: 'System Status',
                    value: status.enabled ? '✅ Enabled' : '❌ Disabled'
                },
                {
                    name: 'Channels',
                    value: Object.entries(status.channels)
                        .map(([category, status]) => `${category}: ${status}`)
                        .join('\n')
                }
            ],
            timestamp: new Date()
        };

        await interaction.reply({
            embeds: [statusEmbed],
            ephemeral: true
        });
    }
};
