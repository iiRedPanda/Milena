import { EmbedBuilder } from 'discord.js';
import logger from './logger.js';

class HelpSystem {
    constructor() {
        this.categories = new Map();
        this.commands = new Map();
        this.examples = new Map();
        this.tutorials = new Map();
    }

    /**
     * Register a command with its documentation
     */
    registerCommand(command, options = {}) {
        const {
            category = 'Miscellaneous',
            description = command.data.description,
            usage = '',
            examples = [],
            permissions = [],
            cooldown = 0,
            tutorial = null
        } = options;

        // Create category if it doesn't exist
        if (!this.categories.has(category)) {
            this.categories.set(category, new Set());
        }
        this.categories.get(category).add(command.data.name);

        // Store command info
        this.commands.set(command.data.name, {
            name: command.data.name,
            description,
            usage,
            permissions,
            cooldown,
            category
        });

        // Store examples
        if (examples.length > 0) {
            this.examples.set(command.data.name, examples);
        }

        // Store tutorial
        if (tutorial) {
            this.tutorials.set(command.data.name, tutorial);
        }

        logger.log('info', 'Command registered in help system', {
            command: command.data.name,
            category
        });
    }

    /**
     * Get the main help embed showing all categories
     */
    getMainHelpEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('📚 Bot Help')
            .setDescription('Welcome to the help system! Select a category to see its commands.')
            .setColor('#2ECC71');

        // Add categories
        for (const [category, commands] of this.categories) {
            embed.addFields({
                name: category,
                value: Array.from(commands).map(cmd => `\`${cmd}\``).join(', ')
            });
        }

        return embed;
    }

    /**
     * Get help embed for a specific category
     */
    getCategoryHelpEmbed(category) {
        if (!this.categories.has(category)) {
            return null;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📚 ${category} Commands`)
            .setColor('#2ECC71');

        const commands = this.categories.get(category);
        for (const cmdName of commands) {
            const cmd = this.commands.get(cmdName);
            embed.addFields({
                name: cmdName,
                value: cmd.description + (cmd.usage ? `\\nUsage: ${cmd.usage}` : '')
            });
        }

        return embed;
    }

    /**
     * Get detailed help embed for a specific command
     */
    getCommandHelpEmbed(commandName) {
        const command = this.commands.get(commandName);
        if (!command) {
            return null;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Command: ${command.name}`)
            .setDescription(command.description)
            .setColor('#2ECC71');

        // Add usage
        if (command.usage) {
            embed.addFields({
                name: 'Usage',
                value: command.usage
            });
        }

        // Add examples
        const examples = this.examples.get(commandName);
        if (examples?.length > 0) {
            embed.addFields({
                name: 'Examples',
                value: examples.join('\\n')
            });
        }

        // Add permissions
        if (command.permissions.length > 0) {
            embed.addFields({
                name: 'Required Permissions',
                value: command.permissions.join(', ')
            });
        }

        // Add cooldown
        if (command.cooldown > 0) {
            embed.addFields({
                name: 'Cooldown',
                value: `${command.cooldown} seconds`
            });
        }

        // Add tutorial link
        const tutorial = this.tutorials.get(commandName);
        if (tutorial) {
            embed.addFields({
                name: 'Tutorial',
                value: `[Click here](${tutorial})`
            });
        }

        return embed;
    }

    /**
     * Search for commands by query
     */
    searchCommands(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const [name, cmd] of this.commands) {
            // Check name and description
            if (name.toLowerCase().includes(lowerQuery) ||
                cmd.description.toLowerCase().includes(lowerQuery)) {
                results.push(cmd);
                continue;
            }

            // Check examples
            const examples = this.examples.get(name);
            if (examples?.some(ex => ex.toLowerCase().includes(lowerQuery))) {
                results.push(cmd);
                continue;
            }
        }

        return results;
    }

    /**
     * Get interactive tutorial for a command
     */
    getCommandTutorial(commandName) {
        const command = this.commands.get(commandName);
        if (!command) {
            return null;
        }

        const tutorial = this.tutorials.get(commandName);
        if (!tutorial) {
            return null;
        }

        return {
            command,
            tutorial,
            examples: this.examples.get(commandName) || []
        };
    }
}

export default new HelpSystem();
