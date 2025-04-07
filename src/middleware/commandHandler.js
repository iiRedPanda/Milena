import { Collection } from 'discord.js';
import logger from '../services/logger.js';
import errorHandler from '../utils/errorHandler.js';
import performanceMonitor from '../services/performanceMonitor.js';

class CommandHandler {
    constructor() {
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.middleware = [];
        
        // Default middleware
        this.use(this.logCommand);
        this.use(this.checkPermissions);
        this.use(this.handleCooldown);
        this.use(this.trackPerformance);
    }

    /**
     * Register a command
     */
    register(command) {
        this.commands.set(command.data.name, command);
    }

    /**
     * Add middleware to the pipeline
     */
    use(middleware) {
        this.middleware.push(middleware);
    }

    /**
     * Handle incoming command
     */
    async handle(interaction) {
        if (!interaction.isCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) return;

        const context = {
            command,
            interaction,
            startTime: Date.now()
        };

        try {
            // Run through middleware pipeline
            for (const middleware of this.middleware) {
                const result = await middleware.call(this, context);
                if (result === false) return; // Middleware rejected command
            }

            // Execute command
            await command.execute(interaction);

            // Log success
            await this.logSuccess(context);
        } catch (error) {
            // Handle error
            await this.handleError(error, context);
        }
    }

    /**
     * Middleware: Log command execution
     */
    async logCommand(context) {
        const { interaction } = context;
        await logger.log('info', 'Command executed', {
            type: 'command',
            command: interaction.commandName,
            user: {
                id: interaction.user.id,
                tag: interaction.user.tag
            },
            guild: interaction.guild ? {
                id: interaction.guild.id,
                name: interaction.guild.name
            } : null,
            channel: {
                id: interaction.channel.id,
                name: interaction.channel.name
            },
            options: interaction.options.data
        });
        return true;
    }

    /**
     * Middleware: Check permissions
     */
    async checkPermissions(context) {
        const { command, interaction } = context;
        
        // Check bot permissions
        if (command.requiredBotPermissions) {
            const botMember = interaction.guild?.members.cache.get(interaction.client.user.id);
            if (botMember && !botMember.permissions.has(command.requiredBotPermissions)) {
                await interaction.reply({
                    content: 'I don\'t have the required permissions to execute this command.',
                    ephemeral: true
                });
                return false;
            }
        }

        // Check user permissions
        if (command.requiredUserPermissions) {
            if (!interaction.member?.permissions.has(command.requiredUserPermissions)) {
                await interaction.reply({
                    content: 'You don\'t have the required permissions to use this command.',
                    ephemeral: true
                });
                return false;
            }
        }

        return true;
    }

    /**
     * Middleware: Handle command cooldowns
     */
    async handleCooldown(context) {
        const { command, interaction } = context;
        if (!command.cooldown) return true;

        const key = `${interaction.user.id}-${command.data.name}`;
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (this.cooldowns.has(key)) {
            const expirationTime = this.cooldowns.get(key) + cooldownAmount;
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                await interaction.reply({
                    content: `Please wait ${timeLeft.toFixed(1)} more seconds before using the \`${command.data.name}\` command.`,
                    ephemeral: true
                });
                return false;
            }
        }

        this.cooldowns.set(key, Date.now());
        setTimeout(() => this.cooldowns.delete(key), cooldownAmount);
        return true;
    }

    /**
     * Middleware: Track command performance
     */
    async trackPerformance(context) {
        context.startTime = Date.now();
        return true;
    }

    /**
     * Log successful command execution
     */
    async logSuccess(context) {
        const duration = Date.now() - context.startTime;
        await performanceMonitor.trackCommand(
            context.command.data.name,
            duration,
            true
        );
    }

    /**
     * Handle command execution error
     */
    async handleError(error, context) {
        const duration = Date.now() - context.startTime;
        await performanceMonitor.trackCommand(
            context.command.data.name,
            duration,
            false
        );

        const result = await errorHandler.handleError(error, {
            command: context.command.data.name,
            user: context.interaction.user.id,
            guild: context.interaction.guild?.id,
            isCommand: true
        });

        try {
            if (!context.interaction.replied && !context.interaction.deferred) {
                await context.interaction.reply({
                    content: result.message,
                    ephemeral: true
                });
            } else if (context.interaction.deferred) {
                await context.interaction.editReply({
                    content: result.message
                });
            }
        } catch (replyError) {
            await logger.log('error', 'Failed to send error response', {
                error: replyError.message,
                originalError: error.message
            });
        }
    }

    /**
     * Get command statistics
     */
    getStats() {
        return {
            totalCommands: this.commands.size,
            registeredCommands: Array.from(this.commands.keys()),
            activeCooldowns: this.cooldowns.size
        };
    }
}

const commandHandler = new CommandHandler();
export default commandHandler;
