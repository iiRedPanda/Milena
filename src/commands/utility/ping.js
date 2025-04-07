import { BaseCommand } from '../BaseCommand.js';

export class PingCommand extends BaseCommand {
    constructor() {
        super({
            name: 'ping',
            description: 'Check bot latency',
            cooldown: 5,
            guildOnly: false,
            ownerOnly: false
        });
    }

    async _execute(interaction) {
        const sent = await interaction.reply({
            content: 'Pinging...',
            ephemeral: true,
            fetchReply: true
        });

        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        await interaction.editReply({
            content: `🏓 Pong!\nBot Latency: ${latency}ms\nAPI Latency: ${apiLatency}ms`,
            ephemeral: true
        });
    }
}
