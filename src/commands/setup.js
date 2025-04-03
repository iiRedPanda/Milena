import { saveConfigurations, STRINGS, logInfo } from '../utils.js';

const errorCategories = ['runtime', 'api', 'validation', 'general'];

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
        const mention = message.mentions.channels.first();
        const category = args[1]?.toLowerCase();

        if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
            message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
            return;
        }

        if (subCommand === 'setErrorChannel') {
            if (!category || !errorCategories.includes(category)) {
                message.reply(`Invalid category. Please choose one of: ${errorCategories.join(', ')}`);
                return;
            }

            if (!mention) {
                const channelName = `bot-${category}-errors`;
                const existingChannel = message.guild.channels.cache.find(ch => ch.name === channelName);

                if (existingChannel) {
                    config.errorChannels = config.errorChannels || {};
                    config.errorChannels[category] = existingChannel.id;
                    await saveConfigurations();
                    message.reply(`Error messages for category "${category}" will now be sent to <#${existingChannel.id}>.`);
                } else {
                    try {
                        const newChannel = await message.guild.channels.create({
                            name: channelName,
                            type: 'GUILD_TEXT',
                            reason: `Channel created for ${category} error messages.`,
                        });

                        config.errorChannels = config.errorChannels || {};
                        config.errorChannels[category] = newChannel.id;
                        await saveConfigurations();
                        message.reply(`Channel <#${newChannel.id}> created and set for "${category}" error messages.`);
                    } catch (error) {
                        message.reply('Failed to create the channel. Please check my permissions and try again.');
                    }
                }
            } else {
                config.errorChannels = config.errorChannels || {};
                config.errorChannels[category] = mention.id;
                await saveConfigurations();
                message.reply(`Error messages for category "${category}" will now be sent to <#${mention.id}>.`);
            }

            return;
        }

        const mentionId = mention?.id;
        logInfo(`Setup command executed by ${message.author.tag}: ${subCommand} ${mentionId || ''}`);

        const actions = {
            allowChannel: () => {
                if (!config.allowedChannels.includes(mentionId)) {
                    config.allowedChannels.push(mentionId);
                    saveConfigurations();
                    message.reply(`Channel <#${mentionId}> has been allowed.`);
                } else {
                    message.reply('This channel is already allowed.');
                }
            },
            allowRole: () => {
                if (!config.allowedRoles.includes(mentionId)) {
                    config.allowedRoles.push(mentionId);
                    saveConfigurations();
                    message.reply(`Role <@&${mentionId}> has been allowed.`);
                } else {
                    message.reply('This role is already allowed.');
                }
            },
            allowAdminRole: () => {
                if (!config.adminRoles.includes(mentionId)) {
                    config.adminRoles.push(mentionId);
                    saveConfigurations();
                    message.reply(`Admin role <@&${mentionId}> has been allowed.`);
                } else {
                    message.reply('This admin role is already allowed.');
                }
            },
        };

        if (actions[subCommand]) {
            actions[subCommand]();
        } else {
            message.reply('Invalid subcommand. Please use a valid subcommand.');
        }
    },
};