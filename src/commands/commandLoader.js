import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../core/logger.js';
import { analytics } from '../services/analytics.js';
import { BaseCommand } from './BaseCommand.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validate command options
 * @param {Object} options - Command options
 * @returns {Object} Validated options
 * @throws {Error} If validation fails
 */
function validateCommandOptions(options) {
    if (!options.name || typeof options.name !== 'string') {
        throw new Error('Command must have a valid name (string)');
    }

    if (!options.description || typeof options.description !== 'string') {
        throw new Error('Command must have a valid description (string)');
    }

    if (options.cooldown && (typeof options.cooldown !== 'number' || options.cooldown < 0)) {
        throw new Error('Command cooldown must be a positive number');
    }

    if (options.permissions && !Array.isArray(options.permissions)) {
        throw new Error('Command permissions must be an array');
    }

    return {
        name: options.name.trim(),
        description: options.description.trim(),
        cooldown: options.cooldown || 3,
        ownerOnly: Boolean(options.ownerOnly),
        guildOnly: Boolean(options.guildOnly),
        permissions: options.permissions || [],
        options: options.options || []
    };
}

/**
 * Load all commands from the commands directory
 * @param {import('discord.js').Client} client - Discord.js client
 * @returns {Promise<void>}
 * @throws {Error} If command loading fails
 */
export async function loadCommands(client) {
    try {
        // Initialize commands collection if not exists
        if (!client.commands) {
            client.commands = new Map();
        }

        const categories = await fs.readdir(__dirname);
        
        for (const category of categories) {
            // Skip non-directories and the loader itself
            if (category === 'commandLoader.js' || category.includes('.')) continue;
            
            const categoryPath = path.join(__dirname, category);
            const stat = await fs.stat(categoryPath);
            if (!stat.isDirectory()) continue;

            // Load commands in this category
            const commandFiles = await fs.readdir(categoryPath);
            
            for (const file of commandFiles) {
                if (!file.endsWith('.js')) continue;

                try {
                    const commandPath = path.join(categoryPath, file);
                    const commandModule = await import(`file://${commandPath}`);
                    
                    // Get the command class (should be the only export)
                    const CommandClass = Object.values(commandModule)[0];
                    if (!CommandClass || typeof CommandClass !== 'function') {
                        throw new Error(`Invalid command module: ${file}`);
                    }

                    // Validate command class
                    if (!CommandClass.prototype._execute) {
                        throw new Error(`Command ${file} must implement _execute method`);
                    }

                    // Validate inheritance
                    if (!(CommandClass.prototype instanceof BaseCommand)) {
                        throw new Error(`Command ${file} must extend BaseCommand`);
                    }

                    // Instantiate the command
                    const command = new CommandClass();

                    // Validate command options
                    try {
                        command.options = validateCommandOptions(command.options);
                    } catch (error) {
                        throw new Error(`Invalid options in ${file}: ${error.message}`);
                    }

                    // Validate command implementation
                    if (!command.name || !command.execute) {
                        throw new Error(`Invalid command implementation in ${file}`);
                    }

                    // Check for duplicate commands
                    if (client.commands.has(command.name)) {
                        throw new Error(`Duplicate command name: ${command.name}`);
                    }

                    // Set the category
                    command.category = category;

                    // Register command
                    client.commands.set(command.name, command);
                    logger.info(`Loaded command: ${command.name}`, {
                        category,
                        file,
                        options: {
                            cooldown: command.cooldown,
                            ownerOnly: command.ownerOnly,
                            guildOnly: command.guildOnly,
                            permissions: command.permissions.length
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to load command: ${file}`, {
                        category,
                        error: error.message,
                        stack: error.stack
                    });
                    analytics.trackError({
                        error,
                        service: 'commandLoader',
                        category,
                        fileName: file,
                        errorType: error.name || 'UnknownError'
                    });
                }
            }
        }

        logger.info(`Loaded ${client.commands.size} commands`, {
            categories: Array.from(client.commands.values()).reduce((acc, cmd) => {
                acc[cmd.category] = (acc[cmd.category] || 0) + 1;
                return acc;
            }, {})
        });

    } catch (error) {
        logger.error('Failed to load commands', {
            error: error.message,
            stack: error.stack
        });
        analytics.trackError({
            error,
            service: 'commandLoader',
            errorType: error.name || 'UnknownError'
        });
        throw error; // Re-throw to handle at higher level
    }
}
