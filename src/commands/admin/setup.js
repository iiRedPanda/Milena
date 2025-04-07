import { saveConfigurations, STRINGS, logInfo } from '../utils.js';

const errorCategories = ['runtime', 'api', 'validation', 'general'];

export default {
    data: {
        name: 'setup',
        description: 'Configure bot settings.',
    },
    async execute(message, config) {
        const startTime = Date.now();
        logInfo(`Setup command received at: ${new Date(startTime).toISOString()}`);

        if (!message.member.permissions.has('ADMINISTRATOR') && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
            await message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
            return;
        }

        const args = message.content.split(' ').slice(1);
        const subCommand = args[0];
        const mention = message.mentions.channels.first();
        const category = args[1]?.toLowerCase();

        if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
            await message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
            return;
        }

        if (subCommand === 'setErrorChannel') {
            if (!category || !errorCategories.includes(category)) {
                await message.reply(`Invalid category. Please choose one of: ${errorCategories.join(', ')}`);
                return;
            }

            if (!mention) {
                const channelName = `bot-${category}-errors`;
                const existingChannel = message.guild.channels.cache.find(ch => ch.name === channelName);

                if (existingChannel) {
                    config.errorChannels = config.errorChannels || {};
                    config.errorChannels[category] = existingChannel.id;
                    await saveConfigurations();
                    await message.reply(`Error messages for category "${category}" will now be sent to <#${existingChannel.id}>.`);
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
                        await message.reply(`Channel <#${newChannel.id}> created and set for "${category}" error messages.`);
                    } catch (error) {
                        await message.reply('Failed to create the channel. Please check my permissions and try again.');
                    }
                }
            } else {
                config.errorChannels = config.errorChannels || {};
                config.errorChannels[category] = mention.id;
                await saveConfigurations();
                await message.reply(`Error messages for category "${category}" will now be sent to <#${mention.id}>.`);
            }

            return;
        }

        const mentionId = mention?.id;
        logInfo(`Setup command executed by ${message.author.tag}: ${subCommand} ${mentionId || ''}`);

        const actions = {
            allowChannel: async () => {
                if (!config.allowedChannels.includes(mentionId)) {
                    config.allowedChannels.push(mentionId);
                    await saveConfigurations();
                    await message.reply(`Channel <#${mentionId}> has been allowed.`);
                } else {
                    await message.reply('This channel is already allowed.');
                }
            },
            allowRole: async () => {
                if (!config.allowedRoles.includes(mentionId)) {
                    config.allowedRoles.push(mentionId);
                    await saveConfigurations();
                    await message.reply(`Role <@&${mentionId}> has been allowed.`);
                } else {
                    await message.reply('This role is already allowed.');
                }
            },
            allowAdminRole: async () => {
                if (!config.adminRoles.includes(mentionId)) {
                    config.adminRoles.push(mentionId);
                    await saveConfigurations();
                    await message.reply(`Admin role <@&${mentionId}> has been allowed.`);
                } else {
                    await message.reply('This admin role is already allowed.');
                }
            },
        };

        if (actions[subCommand]) {
            await actions[subCommand]();
        } else {
            await message.reply('Invalid subcommand. Please use a valid subcommand.');
        }

        const endTime = Date.now();
        logInfo(`Setup command processed in ${endTime - startTime}ms`);
    },
};