import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import personality from '../../services/personality.js';
import { log } from '../../services/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('personality')
        .setDescription('Manage bot personality settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List available personalities'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current personality details'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set active personality')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the personality to set')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new personality')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name for the new personality')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Short description of the personality')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('style')
                        .setDescription('Communication style')
                        .addChoices(
                            { name: 'Casual', value: 'casual' },
                            { name: 'Professional', value: 'professional' },
                            { name: 'Friendly', value: 'friendly' },
                            { name: 'Humorous', value: 'humorous' },
                            { name: 'Technical', value: 'technical' }
                        )
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('tone')
                        .setDescription('Tone of voice')
                        .addChoices(
                            { name: 'Warm', value: 'warm and welcoming' },
                            { name: 'Enthusiastic', value: 'enthusiastic and energetic' },
                            { name: 'Calm', value: 'calm and composed' },
                            { name: 'Witty', value: 'witty and clever' },
                            { name: 'Formal', value: 'formal and polite' }
                        )
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('background')
                        .setDescription('Character background story')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('traits')
                        .setDescription('Comma-separated personality traits')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('interests')
                        .setDescription('Comma-separated interests')
                        .setRequired(false))
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('Emoji representing this personality')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a custom personality')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the personality to delete')
                        .setRequired(true))),

    category: 'ADMIN',
    cooldown: 5,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'list':
                    await this.listPersonalities(interaction);
                    break;
                case 'view':
                    await this.viewPersonality(interaction);
                    break;
                case 'set':
                    await this.setPersonality(interaction);
                    break;
                case 'create':
                    await this.createPersonality(interaction);
                    break;
                case 'delete':
                    await this.deletePersonality(interaction);
                    break;
            }
        } catch (error) {
            log('error', 'Personality command failed', {
                error: error.message,
                stack: error.stack,
                subcommand
            });
            await interaction.reply({
                content: 'Failed to execute personality command.',
                ephemeral: true
            });
        }
    },

    async listPersonalities(interaction) {
        const personalities = personality.listPersonalities();
        const embed = {
            title: '🎭 Available Personalities',
            description: 'Here are all available personalities:',
            fields: personalities.map(p => ({
                name: `${p.emoji} ${p.name} ${p.isActive ? '(Active)' : ''}`,
                value: p.description
            })),
            color: 0x3498db
        };

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async viewPersonality(interaction) {
        const embed = personality.getPersonalityEmbed();
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async setPersonality(interaction) {
        const name = interaction.options.getString('name');
        const success = await personality.setActivePersonality(name);

        if (success) {
            const embed = personality.getPersonalityEmbed();
            await interaction.reply({
                content: `✅ Successfully switched to personality: ${name}`,
                embeds: [embed],
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ Personality "${name}" not found.`,
                ephemeral: true
            });
        }
    },

    async createPersonality(interaction) {
        const name = interaction.options.getString('name');
        const data = {
            description: interaction.options.getString('description'),
            style: interaction.options.getString('style'),
            tone: interaction.options.getString('tone'),
            background: interaction.options.getString('background'),
            traits: interaction.options.getString('traits').split(',').map(t => t.trim()),
            interests: interaction.options.getString('interests')?.split(',').map(i => i.trim()),
            emoji: interaction.options.getString('emoji') || '🤖'
        };

        const success = await personality.createPersonality(name, data);

        if (success) {
            const embed = {
                title: '✨ New Personality Created',
                description: `Successfully created personality: ${name}`,
                fields: [
                    {
                        name: 'Description',
                        value: data.description
                    },
                    {
                        name: 'Style',
                        value: data.style,
                        inline: true
                    },
                    {
                        name: 'Tone',
                        value: data.tone,
                        inline: true
                    }
                ],
                color: 0x2ecc71
            };

            await interaction.reply({
                content: 'Use `/personality set name:' + name + '` to activate this personality.',
                embeds: [embed],
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ Failed to create personality. Name might be taken or data invalid.`,
                ephemeral: true
            });
        }
    },

    async deletePersonality(interaction) {
        const name = interaction.options.getString('name');
        const success = await personality.deletePersonality(name);

        if (success) {
            await interaction.reply({
                content: `✅ Successfully deleted personality: ${name}`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `❌ Cannot delete personality "${name}". It might be the default or doesn't exist.`,
                ephemeral: true
            });
        }
    }
};
