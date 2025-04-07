import { GameBase } from '../GameBase.js';
import { DungeonStoryGenerator } from './storyGenerator.js';
import { DungeonStats } from './dungeonStats.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class DungeonGame extends GameBase {
    constructor() {
        super({
            timeout: 10800000, // 3 hours
            maxLifetime: 10800000,
            cleanupTimeout: 300000, // 5 minutes
            warningTimeout: 3600000 // 1 hour
        });
        
        this.storyModeEstimates = {
            explorer: 900000,     // 15 minutes
            adventurer: 1800000,   // 30 minutes
            hero: 3600000      // 60 minutes
        };
        
        this.storyModeDescriptions = {
            explorer: {
                complexity: 'basic',
                depth: 'shallow',
                encounters: 'few',
                story: 'focused'
            },
            adventurer: {
                complexity: 'moderate',
                depth: 'moderate',
                encounters: 'varied',
                story: 'complete'
            },
            hero: {
                complexity: 'detailed',
                depth: 'deep',
                encounters: 'complex',
                story: 'epic'
            }
        };
        
        this.xpRewards = {
            explorer: 100,
            adventurer: 200,
            hero: 300
        };
        
        this.player = null;
        this.mode = null;
        this.storyGenerator = new DungeonStoryGenerator();
        this.stats = new DungeonStats();
        this.currentStory = null;
        this.inventory = [];
        this.level = 1;
        this.xp = 0;
    }

    async startGame(interaction, mode) {
        if (this.gameState !== 'waiting') {
            await interaction.reply({ content: 'A game is already in progress!', ephemeral: true });
            return;
        }

        this.mode = mode || 'explorer';
        this.player = interaction.user;
        this.gameState = 'active';
        
        this.currentStory = await this.storyGenerator.generateStory({
            mode: this.mode,
            player: this.player.username
        });

        await interaction.reply({
            content: `🌟 Dungeon Adventure (${this.mode}) 🌟\n\n${this.currentStory}\n\nUse /dungeon explore to start your adventure!`,
            components: this.getGameComponents()
        });
    }

    async explore(interaction) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const encounter = await this.storyGenerator.generateEncounter(this.mode);
        await interaction.reply({
            content: encounter,
            components: this.getGameComponents()
        });
    }

    async attack(interaction) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const combatResult = await this.storyGenerator.generateCombatResult();
        await interaction.reply({
            content: combatResult,
            components: this.getGameComponents()
        });
    }

    async useItem(interaction, item) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const result = this.inventory.includes(item) 
            ? `Used ${item} successfully!` 
            : `You don't have ${item} in your inventory!`;

        await interaction.reply({
            content: result,
            components: this.getGameComponents()
        });
    }

    async showInventory(interaction) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const inventoryString = this.inventory.length > 0 
            ? this.inventory.join(', ') 
            : 'Your inventory is empty.';

        await interaction.reply({
            content: `🎒 Inventory:\n${inventoryString}`,
            components: this.getGameComponents()
        });
    }

    async showStats(interaction) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const stats = this.stats.getPlayerStats(this.player.id);
        await interaction.reply({
            content: `📊 Player Stats:\n\nLevel: ${stats.level}\nXP: ${stats.xp}/${stats.xpToNextLevel}\nGames Played: ${stats.gamesPlayed}\nVictories: ${stats.victories}\nDefeats: ${stats.defeats}`,
            components: this.getGameComponents()
        });
    }

    async showHelp(interaction) {
        const commands = `
/dungeon start <mode> - Start a new dungeon adventure
/dungeon explore - Move through the dungeon
/dungeon attack - Attack monsters
/dungeon use <item> - Use items from your inventory
/dungeon inventory - View your items
/dungeon stats - View your progress and achievements
`;

        await interaction.reply({
            content: `🎮 Dungeon Adventure Commands:\n\n${commands}`,
            components: this.getGameComponents()
        });
    }

    getGameComponents() {
        const components = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('explore')
                    .setLabel('Explore')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('attack')
                    .setLabel('Attack')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('inventory')
                    .setLabel('Inventory')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [components];
    }
}

export default DungeonGame;
