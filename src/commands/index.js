import { Collection } from 'discord.js';
import { log } from '../services/logger.js';
import fs from 'fs/promises';
import path from 'path';
import analytics from '../services/analytics.js';
import audit from '../services/audit.js'; // Import the audit system

// Command categories for better organization
export const CommandCategories = {
    GENERAL: {
        name: 'General',
        description: 'Basic bot commands',
        emoji: '🌟'
    },
    MEMORY: {
        name: 'Memory',
        description: 'Memory management commands',
        emoji: '🧠'
    },
    ADMIN: {
        name: 'Admin',
        description: 'Administrative commands',
        emoji: '⚙️'
    },
    AI: {
        name: 'AI',
        description: 'AI-related commands',
        emoji: '🤖'
    }
};

class CommandManager {
    constructor(client) {
        this.client = client;
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.aliases = new Collection();
        this.watching = new Set();
    }

    async loadCommands() {
        try {
            const commandFiles = await fs.readdir(__dirname);
            const jsFiles = commandFiles.filter(file => file.endsWith('.js') && file !== 'index.js');

            for (const file of jsFiles) {
                await this.loadCommand(file);
            }

            log('info', 'Commands loaded successfully', {
                count: this.commands.size,
                commands: Array.from(this.commands.keys())
            });

            // Start watching command files for changes
            this.watchCommands();

        } catch (error) {
            log('error', 'Failed to load commands', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async loadCommand(file) {
        try {
            const filePath = path.join(__dirname, file);
            
            // Clear require cache if reloading
            delete require.cache[require.resolve(filePath)];
            
            const command = (await import(`file://${filePath}`)).default;
            
            // Validate command structure
            this.validateCommand(command, file);
            
            // Add command to collection
            this.commands.set(command.data.name, command);
            
            // Add aliases if any
            if (command.aliases) {
                command.aliases.forEach(alias => {
                    this.aliases.set(alias, command.data.name);
                });
            }
            
            return true;
        } catch (error) {
            log('error', `Failed to load command: ${file}`, {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    validateCommand(command, file) {
        const required = ['data', 'execute'];
        const recommendedData = ['name', 'description', 'category', 'cooldown'];
        
        // Check required properties
        for (const prop of required) {
            if (!command[prop]) {
                throw new Error(`Missing required property: ${prop} in ${file}`);
            }
        }
        
        // Check recommended properties
        for (const prop of recommendedData) {
            if (!command.data[prop]) {
                log('warn', `Missing recommended property: ${prop} in ${file}`);
            }
        }
        
        // Validate category
        if (command.data.category && !CommandCategories[command.data.category]) {
            throw new Error(`Invalid category: ${command.data.category} in ${file}`);
        }
    }

    async reloadCommand(commandName) {
        const command = this.commands.get(commandName) || 
                       this.commands.get(this.aliases.get(commandName));
                       
        if (!command) return false;

        const commandFile = `${command.data.name}.js`;
        return await this.loadCommand(commandFile);
    }

    watchCommands() {
        if (this.watching.size > 0) return; // Already watching

        const watcher = fs.watch(__dirname, async (eventType, filename) => {
            if (!filename || !filename.endsWith('.js') || filename === 'index.js') return;
            
            if (eventType === 'change') {
                const commandName = filename.slice(0, -3);
                log('info', `Command file changed: ${filename}`);
                
                // Reload the command
                await this.reloadCommand(commandName);
            }
        });

        this.watching.add(watcher);
        log('info', 'Started watching command files for changes');
    }

    checkCooldown(command, userId) {
        if (!command.data.cooldown) return false;

        const cooldownAmount = command.data.cooldown * 1000;
        const userCooldowns = this.cooldowns.get(command.data.name) || new Collection();
        
        if (userCooldowns.has(userId)) {
            const expirationTime = userCooldowns.get(userId) + cooldownAmount;
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return timeLeft;
            }
        }

        userCooldowns.set(userId, Date.now());
        this.cooldowns.set(command.data.name, userCooldowns);
        return false;
    }

    async executeCommand(interaction) {
        const command = this.commands.get(interaction.commandName);
        if (!command) return;

        // Check cooldown
        const cooldownLeft = this.checkCooldown(command, interaction.user.id);
        if (cooldownLeft) {
            await interaction.reply({
                content: `Please wait ${cooldownLeft.toFixed(1)} seconds before using this command again.`,
                ephemeral: true
            });
            return;
        }

        try {
            const startTime = performance.now();
            await command.execute(interaction);
            const duration = performance.now() - startTime;

            // Track command usage
            analytics.trackMessage({
                commandName: interaction.commandName,
                author: interaction.user,
                channel: interaction.channel
            }, duration);

            // Log to audit system
            audit.logCommand(command, interaction.user, interaction.channel, Math.round(duration));

        } catch (error) {
            log('error', `Command execution failed: ${interaction.commandName}`, {
                error: error.message,
                stack: error.stack,
                user: interaction.user.tag
            });

            analytics.trackError(error);
            audit.logError(error, `Command: ${interaction.commandName}`);

            const errorMessage = error.message.includes('permission')
                ? "You don't have permission to use this command."
                : "There was an error executing this command.";

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    }

    getCommandsByCategory() {
        const categories = {};
        
        for (const [name, command] of this.commands) {
            const category = command.data.category || 'GENERAL';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(command);
        }
        
        return categories;
    }
}

export default CommandManager;
