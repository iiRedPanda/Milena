import os from 'os';

export default {
    name: 'status',
    description: 'View bot status and system information.',
    async execute(interaction) {
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const commandCount = interaction.client.commands.size;
        const activeUsers = interaction.client.users.cache.size;
        const timestamp = new Date().toLocaleString();
        const statusMessage = `
        **Milena Bot Status:**
        - Uptime: ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.
        - Memory Usage: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB.
        - System Load: ${os.loadavg().map(load => load.toFixed(2)).join(', ')} (1m, 5m, 15m).
        - Loaded Commands: ${commandCount}
        - Active Users: ${activeUsers}
        - Timestamp: ${timestamp}
        `;

        await interaction.reply({
            content: statusMessage,
            ephemeral: true,
        });
    },
};