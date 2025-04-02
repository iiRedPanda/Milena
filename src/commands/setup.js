import { saveConfigurations, STRINGS } from '../utils.js';

export default {
    name: 'setup',
    description: 'Configure bot settings.',
    async execute(message, config) {
        if (!message.member.permissions.has('ADMINISTRATOR') && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
            message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
            return;
        }
        const args = message.content.split(' ').slice(1);
        const subCommand = args[0];
        const mention = message.mentions.channels.first() || message.mentions.roles.first();
        if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
            message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
            return;
        }
        if (!mention) {
            message.reply('Please mention a valid channel or role.');
            return;
        }
        const id = mention.id;
        const actions = {
            allowChannel: () => {
                if (!config.allowedChannels.includes(id)) {
                    config.allowedChannels.push(id);
                    saveConfigurations();
                    message.reply(`Channel <#${id}> has been allowed.`);
                } else {
                    message.reply('This channel is already allowed.');
                }
            },
            allowRole: () => {
                if (!config.allowedRoles.includes(id)) {
                    config.allowedRoles.push(id);
                    saveConfigurations();
                    message.reply(`Role <@&${id}> has been allowed.`);
                } else {
                    message.reply('This role is already allowed.');
                }
            },
            allowAdminRole: () => {
                if (!config.adminRoles.includes(id)) {
                    config.adminRoles.push(id);
                    saveConfigurations();
                    message.reply(`Admin role <@&${id}> has been allowed.`);
                } else {
                    message.reply('This admin role is already allowed.');
                }
            },
            setErrorChannel: () => {
                config.errorNotificationChannel = id;
                saveConfigurations();
                message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
            },
        };
        if (actions[subCommand]) {
            actions[subCommand]();
        } else {
            message.reply('Invalid subcommand. Please use a valid subcommand.');
        }
    },
};