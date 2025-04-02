import os from 'os';

export default {
    name: 'status',
    description: 'View bot status and system information.',
    async execute(message, config) {
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
        const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
        const statusMessage = `
        **Milena Bot Status:**
        - Uptime: ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.
        - Memory Usage: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB.
        - System Load: ${os.loadavg().map(load => load.toFixed(2)).join(', ')} (1m, 5m, 15m).
        - Allowed Channels: ${allowedChannels}
        - Allowed Roles: ${allowedRoles}
        `;
        message.reply(statusMessage);
    },
};