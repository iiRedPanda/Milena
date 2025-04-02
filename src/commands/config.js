import { configurations, saveConfigurations } from '../utils.js';
import validator from 'validator';
import { logError, logInfo } from '../logger.js';

const allowedKeys = ['allowedChannels', 'allowedRoles', 'adminRoles', 'errorNotificationChannel'];

export default {
    name: 'config',
    description: 'View or update bot configurations.',
    async execute(message) {
        const args = message.content.split(' ').slice(1);
        const key = args[0];
        const value = args[1];

        if (!message.member.permissions.has('ADMINISTRATOR') && !configurations[message.guild.id]?.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
            message.reply("You do not have permission to use this command.");
            return;
        }

        if (key && value) {
            if (!allowedKeys.includes(key)) {
                message.reply("Invalid configuration key.");
                return;
            }

            if (validator.isAlphanumeric(key) && validator.isAlphanumeric(value)) {
                try {
                    configurations[message.guild.id][key] = value;
                    await saveConfigurations();
                    message.reply(`Configuration updated: ${key} = ${value}`);
                    logInfo(`Configuration updated by ${message.author.tag}: ${key} = ${value}`);
                } catch (error) {
                    message.reply("Failed to update configuration. Please try again.");
                    logError("Error updating configuration:", { error });
                }
            } else {
                message.reply("Invalid input. Please provide alphanumeric values.");
            }
        } else {
            message.reply(`Current configuration: ${JSON.stringify(configurations[message.guild.id], null, 2)}`);
        }
    },
};