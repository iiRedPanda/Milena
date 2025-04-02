import { memory, saveMemory, STRINGS } from '../utils.js';

export default {
    name: 'clear',
    description: 'Clear the memory for the current channel.',
    async execute(message, config) {
        const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
            message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        memory[message.channel.id] = [];
        await saveMemory();
        message.reply(STRINGS.MEMORY_CLEARED);
    },
};