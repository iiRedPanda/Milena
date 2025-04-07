import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { BaseCommand } from '../../core/BaseCommand.js';
import { DungeonGame } from '../../games/dungeon/DungeonGame.js';
import { logger } from '../../core/logger.js';

export default class DungeonCommand extends BaseCommand {
    constructor() {
        const builder = new SlashCommandBuilder()
            .setName('dungeon')
            .setDescription('Explore a dungeon adventure')
            .addStringOption(option =>
                option
                    .setName('action')
                    .setDescription('Action to take')
                    .addChoices(
                        { name: 'Start', value: 'start' },
                        { name: 'Explore', value: 'explore' },
                        { name: 'Attack', value: 'attack' },
                        { name: 'Use', value: 'use' },
                        { name: 'Inventory', value: 'inventory' },
                        { name: 'Stats', value: 'stats' },
                        { name: 'Help', value: 'help' }
                    )
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('mode')
                    .setDescription('Dungeon mode')
                    .addChoices(
                        { name: 'Explorer', value: 'explorer' },
                        { name: 'Adventurer', value: 'adventurer' },
                        { name: 'Hero', value: 'hero' }
                    )
                    .setRequired(false)
            )
            .addStringOption(option =>
                option
                    .setName('item')
                    .setDescription('Item to use')
                    .setRequired(false)
            );

        super({
            ...builder.toJSON(),
            requiredPermissions: [PermissionFlagsBits.SendMessages],
            cooldown: 5000
        });
    }

    async execute(interaction) {
        try {
            const dungeon = new DungeonGame();
            const action = interaction.options.getString('action');
            const mode = interaction.options.getString('mode');
            const item = interaction.options.getString('item');

            switch (action) {
                case 'start':
                    await dungeon.startGame(interaction, mode);
                    break;
                case 'explore':
                    await dungeon.explore(interaction);
                    break;
                case 'attack':
                    await dungeon.attack(interaction);
                    break;
                case 'use':
                    if (!item) {
                        await interaction.reply({ content: 'Please specify an item to use.', ephemeral: true });
                        return;
                    }
                    await dungeon.useItem(interaction, item);
                    break;
                case 'inventory':
                    await dungeon.showInventory(interaction);
                    break;
                case 'stats':
                    await dungeon.showStats(interaction);
                    break;
                case 'help':
                    await dungeon.showHelp(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Dungeon command error:', error);
            await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
        }
    }
}
