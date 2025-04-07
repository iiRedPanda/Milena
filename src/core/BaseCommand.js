import { SlashCommandBuilder } from 'discord.js';
import { CONFIG } from '../constants/config.js';
import { MESSAGES } from '../constants/messages.js';
import { logger } from './logger.js';
import { analytics } from '../services/analytics.js';

export class BaseCommand {
    constructor(data) {
        this.data = data;
        this.cooldowns = new Map();
    }

    async execute(interaction) {
        try {
            // Check permissions
            if (!this.checkPermissions(interaction)) {
                await interaction.reply({
                    content: MESSAGES.ERROR.MISSING_PERMISSIONS,
                    ephemeral: true
                });
                return;
            }

            // Check cooldown
            if (!this.checkCooldown(interaction)) {
                await interaction.reply({
                    content: MESSAGES.ERROR.COOLDOWN,
                    ephemeral: true
                });
                return;
            }

            // Track command usage
            analytics.trackCommand(this.data.name, {
                userId: interaction.user.id,
                guildId: interaction.guild.id
            });

            // Execute command logic
            await this.run(interaction);
        } catch (error) {
            logger.error('Error executing command', {
                command: this.data.name,
                error
            });
            await interaction.reply({
                content: 'An error occurred while executing this command.',
                ephemeral: true
            });
        }
    }

    checkPermissions(interaction) {
        const requiredPermissions = this.data.permissions || [];
        if (!requiredPermissions.length) return true;

        const hasPermissions = requiredPermissions.every(permission => {
            return interaction.member.permissions.has(permission);
        });

        if (!hasPermissions) {
            logger.warn('User lacks required permissions', {
                command: this.data.name,
                userId: interaction.user.id,
                missingPermissions: requiredPermissions
            });
        }

        return hasPermissions;
    }

    checkCooldown(interaction) {
        const userId = interaction.user.id;
        const now = Date.now();

        if (!this.cooldowns.has(userId)) {
            this.cooldowns.set(userId, now);
            return true;
        }

        const lastUsed = this.cooldowns.get(userId);
        const cooldown = this.data.cooldown || CONFIG.COMMAND.COOLDOWN;

        if (now - lastUsed >= cooldown) {
            this.cooldowns.set(userId, now);
            return true;
        }

        const remaining = Math.ceil((cooldown - (now - lastUsed)) / 1000);
        logger.info('Command on cooldown', {
            command: this.data.name,
            userId,
            remainingSeconds: remaining
        });

        return false;
    }

    async run(interaction) {
        throw new Error('Command must implement run method');
    }

    static createBuilder() {
        return new SlashCommandBuilder();
    }
}
