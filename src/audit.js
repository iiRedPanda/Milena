import { EmbedBuilder, ChannelType } from 'discord.js';
import { log } from '../botLogger.js';
import fs from 'fs/promises';
import path from 'path';

class AuditSystem {
    constructor() {
        this.config = {
            enabled: false,
            channels: {},
            categories: {
                COMMANDS: {
                    name: 'Commands',
                    color: '#4287f5',
                    emoji: '🎮'
                },
                MESSAGES: {
                    name: 'Messages',
                    color: '#42f587',
                    emoji: '💬'
                },
                ERRORS: {
                    name: 'Errors',
                    color: '#f54242',
                    emoji: '⚠️'
                },
                SYSTEM: {
                    name: 'System',
                    color: '#f5a442',
                    emoji: '⚙️'
                },
                ANALYTICS: {
                    name: 'Analytics',
                    color: '#9b42f5',
                    emoji: '📊'
                }
            }
        };
        
        this.messageQueue = new Map();
        this.queueInterval = 5000; // 5 seconds
        this.setupMessageQueue();
    }

    async loadConfig() {
        try {
            const configPath = path.join(process.cwd(), 'data', 'audit_config.json');
            const data = await fs.readFile(configPath, 'utf8');
            this.config = { ...this.config, ...JSON.parse(data) };
        } catch (error) {
            // Config doesn't exist yet, will be created when saving
            log('info', 'No audit config found, using defaults');
        }
    }

    async saveConfig() {
        try {
            const configPath = path.join(process.cwd(), 'data', 'audit_config.json');
            await fs.mkdir(path.dirname(configPath), { recursive: true });
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            log('error', 'Failed to save audit config', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    setupMessageQueue() {
        // Process queued messages every 5 seconds
        setInterval(() => this.processMessageQueue(), this.queueInterval);
    }

    async processMessageQueue() {
        for (const [channelId, messages] of this.messageQueue.entries()) {
            if (messages.length === 0) continue;

            try {
                const channel = await this.getChannel(channelId);
                if (!channel) continue;

                // Group similar messages
                const groupedMessages = this.groupMessages(messages);
                
                // Create and send embeds
                for (const group of groupedMessages) {
                    const embed = this.createEmbed(group);
                    await channel.send({ embeds: [embed] });
                }

                // Clear processed messages
                this.messageQueue.set(channelId, []);
            } catch (error) {
                log('error', 'Failed to process audit message queue', {
                    error: error.message,
                    channelId
                });
            }
        }
    }

    groupMessages(messages) {
        // Group messages by type and similarity
        const groups = [];
        let currentGroup = [];

        for (const msg of messages) {
            if (currentGroup.length === 0) {
                currentGroup.push(msg);
                continue;
            }

            const lastMsg = currentGroup[currentGroup.length - 1];
            if (this.areMessagesSimilar(lastMsg, msg)) {
                currentGroup.push(msg);
            } else {
                groups.push([...currentGroup]);
                currentGroup = [msg];
            }

            // Split if group gets too large
            if (currentGroup.length >= 10) {
                groups.push([...currentGroup]);
                currentGroup = [];
            }
        }

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    }

    areMessagesSimilar(msg1, msg2) {
        return msg1.type === msg2.type && 
               msg1.category === msg2.category &&
               Date.now() - msg1.timestamp < 300000; // 5 minutes
    }

    createEmbed(messages) {
        const first = messages[0];
        const category = this.config.categories[first.category];
        
        const embed = new EmbedBuilder()
            .setColor(category.color)
            .setTitle(`${category.emoji} ${category.name} Audit Log`)
            .setTimestamp();

        if (messages.length === 1) {
            // Single detailed message
            this.addFieldsToEmbed(embed, first);
        } else {
            // Group summary
            embed.setDescription(`${messages.length} similar events in the last 5 minutes`);
            this.addGroupFieldsToEmbed(embed, messages);
        }

        return embed;
    }

    addFieldsToEmbed(embed, message) {
        switch (message.category) {
            case 'COMMANDS':
                embed.addFields(
                    { name: 'Command', value: message.data.command, inline: true },
                    { name: 'User', value: message.data.user, inline: true },
                    { name: 'Channel', value: message.data.channel, inline: true }
                );
                if (message.data.duration) {
                    embed.addFields({ name: 'Duration', value: `${message.data.duration}ms` });
                }
                break;

            case 'ERRORS':
                embed.addFields(
                    { name: 'Error', value: message.data.error },
                    { name: 'Location', value: message.data.location || 'Unknown' }
                );
                if (message.data.solution) {
                    embed.addFields({ name: 'Suggested Solution', value: message.data.solution });
                }
                if (message.data.logFile) {
                    embed.addFields({ name: 'Log Reference', value: message.data.logFile });
                }
                break;

            case 'ANALYTICS':
                for (const [key, value] of Object.entries(message.data)) {
                    embed.addFields({ name: key, value: String(value), inline: true });
                }
                break;

            default:
                embed.setDescription(message.data.content);
        }
    }

    addGroupFieldsToEmbed(embed, messages) {
        switch (messages[0].category) {
            case 'COMMANDS':
                const commandCounts = {};
                const users = new Set();
                messages.forEach(msg => {
                    commandCounts[msg.data.command] = (commandCounts[msg.data.command] || 0) + 1;
                    users.add(msg.data.user);
                });
                
                embed.addFields(
                    { name: 'Commands Used', value: Object.entries(commandCounts)
                        .map(([cmd, count]) => `${cmd}: ${count}x`)
                        .join('\n')
                    },
                    { name: 'Unique Users', value: String(users.size) }
                );
                break;

            case 'ERRORS':
                const errorCounts = {};
                messages.forEach(msg => {
                    errorCounts[msg.data.error] = (errorCounts[msg.data.error] || 0) + 1;
                });
                
                embed.addFields({
                    name: 'Error Summary',
                    value: Object.entries(errorCounts)
                        .map(([error, count]) => `${error}: ${count}x`)
                        .join('\n')
                });
                break;
        }
    }

    async setupChannels(guild, category) {
        const channels = {};
        
        for (const [key, value] of Object.entries(this.config.categories)) {
            // Create or find channel
            const channelName = `audit-${key.toLowerCase()}`;
            let channel = guild.channels.cache.find(ch => 
                ch.name === channelName && ch.parent?.id === category.id
            );

            if (!channel) {
                channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category,
                    topic: `Audit logs for ${value.name}`,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: ['ViewChannel', 'SendMessages'],
                        },
                        {
                            id: guild.roles.cache.find(r => r.name === 'Admin')?.id,
                            allow: ['ViewChannel'],
                        }
                    ]
                });
            }

            channels[key] = channel.id;
        }

        this.config.channels = channels;
        await this.saveConfig();
    }

    queueAuditLog(category, data) {
        if (!this.config.enabled || !this.config.channels[category]) return;

        const channelId = this.config.channels[category];
        if (!this.messageQueue.has(channelId)) {
            this.messageQueue.set(channelId, []);
        }

        this.messageQueue.get(channelId).push({
            type: 'audit',
            category,
            timestamp: Date.now(),
            data
        });
    }

    async getChannel(channelId) {
        try {
            const channel = await this.client?.channels.fetch(channelId);
            return channel;
        } catch (error) {
            log('error', 'Failed to fetch audit channel', {
                error: error.message,
                channelId
            });
            return null;
        }
    }

    logCommand(command, user, channel, duration) {
        this.queueAuditLog('COMMANDS', {
            command: command.data.name,
            user: user.tag,
            channel: channel.name,
            duration
        });
    }

    logError(error, location, solution = null) {
        this.queueAuditLog('ERRORS', {
            error: error.message,
            location,
            solution,
            logFile: this.findLogReference(error)
        });
    }

    logAnalytics(data) {
        this.queueAuditLog('ANALYTICS', data);
    }

    findLogReference(error) {
        // Extract filename and line number from error stack
        const match = error.stack?.match(/at\s+(.+):(\d+):(\d+)/);
        if (match) {
            const [, file, line] = match;
            return `${path.relative(process.cwd(), file)}:${line}`;
        }
        return null;
    }
}

const audit = new AuditSystem();
export default audit;
