import { configurations, saveConfigurations } from '../utils.js';
import validator from 'validator';

const allowedKeys = ['allowedChannels', 'allowedRoles', 'adminRoles', 'errorNotificationChannel'];

export default {
    name: 'config',
    description: 'View or update bot configurations.',
    async execute(message) {
        const args = message.content.split(' ').slice(1);
        const key = args[0];
        const value = args[1];
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
                } catch (error) {
                    message.reply("Failed to update configuration. Please try again.");
                    logger.error("Error updating configuration:", error);
                }
            } else {
                message.reply("Invalid input. Please provide alphanumeric values.");
            }
        } else {
            message.reply(`Current configuration: ${JSON.stringify(configurations[message.guild.id], null, 2)}`);
        }
    },
};