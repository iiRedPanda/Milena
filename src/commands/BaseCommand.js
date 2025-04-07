import { logger } from '../core/logger.js';
import { analytics } from '../services/analytics.js';
import { MESSAGES } from '../constants/messages.js';

export class BaseCommand {
    constructor(options = {}) {
        this.name = options.name || '';
        this.description = options.description || '';
        this.options = options.options || [];
        this.cooldown = options.cooldown || 3;
        this.ownerOnly = options.ownerOnly || false;
        this.guildOnly = options.guildOnly || false;
        this.permissions = options.permissions || [];
        this.lastUsed = new Map();
        this.cooldownCleanupInterval = 60000; // Cleanup every minute
        this.setupCooldownCleanup();
    }

    setupCooldownCleanup() {
        setInterval(() => {
            const now = Date.now();
            this.lastUsed.forEach((time, userId) => {
                if (now - time > this.cooldown * 1000) {
                    this.lastUsed.delete(userId);
                }
            });
        }, this.cooldownCleanupInterval);
    }

    /**
     * Check if the command can be executed by the user
     */
    async canExecute(interaction) {
        // Check owner only
        if (this.ownerOnly && interaction.user.id !== process.env.OWNER_ID) {
            await interaction.reply({
                content: MESSAGES.ERROR.OWNER_ONLY,
                ephemeral: true
            });
            return false;
        }

        // Check guild only
        if (this.guildOnly && !interaction.guildId) {
            await interaction.reply({
                content: MESSAGES.ERROR.PRIVATE_COMMAND,
                ephemeral: true
            });
            return false;
        }

        // Check permissions
        if (this.permissions.length > 0) {
            const missingPermissions = this.permissions.filter(
                permission => !interaction.member.permissions.has(permission)
            );

            if (missingPermissions.length > 0) {
                await interaction.reply({
                    content: `${MESSAGES.ERROR.MISSING_PERMISSIONS} ${missingPermissions.join(', ')}`,
                    ephemeral: true
                });
                return false;
            }
        }

        // Check cooldown
        const userId = interaction.user.id;
        const now = Date.now();
        const lastUsedTime = this.lastUsed.get(userId) || 0;
        const cooldownExpired = now - lastUsedTime > this.cooldown * 1000;

        if (!cooldownExpired) {
            const remainingTime = Math.ceil((this.cooldown * 1000 - (now - lastUsedTime)) / 1000);
            await interaction.reply({
                content: `${MESSAGES.ERROR.COOLDOWN} ${remainingTime} seconds.`,
                ephemeral: true
            });
            return false;
        }

        return true;
    }

    /**
     * Execute the command
     */
    async execute(interaction) {
        if (!this.name) {
            throw new Error('Command name must be specified');
        }

        try {
            const startTime = Date.now();

            // Check if command can be executed
            if (!await this.canExecute(interaction)) {
                return;
            }

            // Update last used time
            this.lastUsed.set(interaction.user.id, Date.now());

            // Execute command
            const result = await this._execute(interaction);

            // Track analytics
            const endTime = Date.now();
            analytics.trackCommandExecution(this.name, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                duration: endTime - startTime,
                success: true
            });

            return result;

        } catch (error) {
            logger.error('Command execution error', {
                command: this.name,
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                guildId: interaction.guildId
            });

            // Track error
            analytics.trackError({
                error,
                service: 'command',
                command: this.name,
                userId: interaction.user.id,
                context: {
                    channelId: interaction.channelId,
                    guildId: interaction.guildId
                }
            });

            // Handle different types of errors
            if (error.name === 'ValidationError') {
                await interaction.reply({
                    content: error.message,
                    ephemeral: true
                });
            } else if (error.name === 'PermissionError') {
                await interaction.reply({
                    content: MESSAGES.ERROR.PERMISSION_DENIED,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: MESSAGES.ERROR.COMMAND_FAILED,
                    ephemeral: true
                });
            }

            // Track failed command execution
            analytics.trackCommandExecution(this.name, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                duration: Date.now() - startTime,
                success: false
            });
        }
    }

    /**
     * Abstract method that must be implemented by subclasses
     * @abstract
     * @param {Object} interaction - The Discord interaction object
     * @returns {Promise<void>}
     */
    _execute(interaction) {
        throw new Error('Abstract method _execute must be implemented by subclasses');
    }
}
