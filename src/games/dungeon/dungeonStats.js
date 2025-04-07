import { fetchGeminiResponse } from '../../services/ai.js';
import { log } from '../../botLogger.js';

class DungeonStats {
    constructor() {
        this.stats = new Map();
        this.achievements = {
            basic: [
                { id: 'first_game', name: 'First Steps', description: 'Complete your first dungeon', points: 10 },
                { id: 'quick_master', name: 'Quick Master', description: 'Complete 5 quick mode games', points: 50 },
                { id: 'quick_perfect', name: 'Perfect Quick', description: 'Complete quick mode without dying', points: 75 }
            ],
            intermediate: [
                { id: 'normal_master', name: 'Normal Master', description: 'Complete 5 normal mode games', points: 100 },
                { id: 'survivor', name: 'Survivor', description: 'Complete 10 games without dying', points: 150 },
                { id: 'collector', name: 'Collector', description: 'Find all hidden treasures', points: 200 }
            ],
            master: [
                { id: 'epic_master', name: 'Epic Master', description: 'Complete 5 epic mode games', points: 250 },
                { id: 'story_completionist', name: 'Story Completionist', description: 'Complete all endings', points: 300 },
                { id: 'legendary', name: 'Legendary Hero', description: 'Achieve all master achievements', points: 500 }
            ]
        };

        this.rewards = {
            quick: [
                { name: 'Basic Health Potion', type: 'potion', effect: '+10 HP', rarity: 'common' },
                { name: 'Common Weapon', type: 'weapon', damage: 2, rarity: 'common' },
                { name: 'Basic Armor', type: 'armor', defense: 1, rarity: 'common' }
            ],
            normal: [
                { name: 'Advanced Health Potion', type: 'potion', effect: '+20 HP', rarity: 'uncommon' },
                { name: 'Rare Weapon', type: 'weapon', damage: 4, rarity: 'uncommon' },
                { name: 'Advanced Armor', type: 'armor', defense: 2, rarity: 'uncommon' }
            ],
            epic: [
                { name: 'Legendary Health Potion', type: 'potion', effect: '+50 HP', rarity: 'rare' },
                { name: 'Epic Weapon', type: 'weapon', damage: 8, rarity: 'rare' },
                { name: 'Legendary Armor', type: 'armor', defense: 4, rarity: 'rare' }
            ]
        };
    }

    async getStats(userId) {
        if (!this.stats.has(userId)) {
            this.stats.set(userId, {
                gamesStarted: 0,
                gamesCompleted: 0,
                deaths: 0,
                endings: new Set(),
                experience: 0,
                achievements: new Set(),
                rewards: [],
                bestTime: null,
                lastGame: null
            });
        }

        const playerStats = this.stats.get(userId);
        return {
            gamesStarted: playerStats.gamesStarted,
            gamesCompleted: playerStats.gamesCompleted,
            deaths: playerStats.deaths,
            endings: Array.from(playerStats.endings),
            experience: playerStats.experience,
            achievements: Array.from(playerStats.achievements),
            rewards: playerStats.rewards,
            bestTime: playerStats.bestTime,
            lastGame: playerStats.lastGame
        };
    }

    async updateStats(userId, game) {
        const stats = this.stats.get(userId);
        
        // Update basic stats
        stats.gamesStarted++;
        if (game.state === 'ended' && game.ending) {
            stats.gamesCompleted++;
            stats.endings.add(game.ending);
            
            // Check for achievements
            await this.checkAchievements(userId, game);
            
            // Award experience based on game mode
            const experience = {
                quick: 100,
                normal: 250,
                epic: 500
            }[game.mode] || 100;
            stats.experience += experience;
            
            // Award rewards based on game mode
            const rewards = this.rewards[game.mode];
            if (rewards) {
                const reward = rewards[Math.floor(Math.random() * rewards.length)];
                stats.rewards.push({
                    item: reward,
                    timestamp: new Date().toISOString(),
                    gameMode: game.mode
                });
            }

            // Update best time if applicable
            const completionTime = game.lastActivity - game.startTime;
            if (!stats.bestTime || completionTime < stats.bestTime) {
                stats.bestTime = completionTime;
            }
        } else if (game.state === 'ended' && !game.ending) {
            stats.deaths++;
        }

        stats.lastGame = {
            mode: game.mode,
            endTime: new Date().toISOString(),
            outcome: game.ending ? 'completed' : 'failed'
        };

        return stats;
    }

    async checkAchievements(userId, game) {
        const stats = this.stats.get(userId);
        const achievements = this.achievements;
        
        // Check basic achievements
        if (!stats.achievements.has('first_game') && stats.gamesCompleted > 0) {
            stats.achievements.add('first_game');
        }

        // Check quick mode achievements
        if (game.mode === 'quick') {
            if (!stats.achievements.has('quick_master') && stats.gamesCompleted >= 5) {
                stats.achievements.add('quick_master');
            }
            if (!stats.achievements.has('quick_perfect') && stats.gamesCompleted >= 1 && stats.deaths === 0) {
                stats.achievements.add('quick_perfect');
            }
        }

        // Check normal mode achievements
        if (game.mode === 'normal') {
            if (!stats.achievements.has('normal_master') && stats.gamesCompleted >= 5) {
                stats.achievements.add('normal_master');
            }
            if (!stats.achievements.has('survivor') && stats.gamesCompleted >= 10 && stats.deaths === 0) {
                stats.achievements.add('survivor');
            }
        }

        // Check epic mode achievements
        if (game.mode === 'epic') {
            if (!stats.achievements.has('epic_master') && stats.gamesCompleted >= 5) {
                stats.achievements.add('epic_master');
            }
        }

        // Check story completionist achievement
        if (!stats.achievements.has('story_completionist') && stats.endings.size === 4) {
            stats.achievements.add('story_completionist');
        }

        // Check legendary hero achievement
        if (!stats.achievements.has('legendary') && 
            stats.achievements.size === achievements.basic.length + 
            achievements.intermediate.length + 
            achievements.master.length) {
            stats.achievements.add('legendary');
        }
    }

    async getLeaderboard() {
        const leaderboard = Array.from(this.stats.entries())
            .map(([userId, stats]) => ({
                userId,
                stats: {
                    gamesCompleted: stats.gamesCompleted,
                    experience: stats.experience,
                    achievements: Array.from(stats.achievements).length,
                    bestTime: stats.bestTime,
                    endings: Array.from(stats.endings).length
                }
            }))
            .sort((a, b) => {
                // Sort by:
                // 1. Most games completed
                // 2. Most experience
                // 3. Most achievements
                // 4. Most unique endings
                // 5. Best completion time
                if (a.stats.gamesCompleted !== b.stats.gamesCompleted) {
                    return b.stats.gamesCompleted - a.stats.gamesCompleted;
                }
                if (a.stats.experience !== b.stats.experience) {
                    return b.stats.experience - a.stats.experience;
                }
                if (a.stats.achievements !== b.stats.achievements) {
                    return b.stats.achievements - a.stats.achievements;
                }
                if (a.stats.endings !== b.stats.endings) {
                    return b.stats.endings - a.stats.endings;
                }
                return a.stats.bestTime - b.stats.bestTime;
            });

        return leaderboard;
    }

    async getRewards(userId) {
        const stats = this.stats.get(userId);
        const rewards = stats.rewards.map(reward => ({
            item: reward.item,
            timestamp: new Date(reward.timestamp).toLocaleDateString(),
            gameMode: reward.gameMode
        }));

        return rewards;
    }

    async getAchievements(userId) {
        const stats = this.stats.get(userId);
        const achievements = Array.from(stats.achievements).map(achievementId => {
            const achievement = [
                ...this.achievements.basic,
                ...this.achievements.intermediate,
                ...this.achievements.master
            ].find(a => a.id === achievementId);

            return {
                id: achievement.id,
                name: achievement.name,
                description: achievement.description,
                points: achievement.points,
                type: achievement.type || 'achievement'
            };
        });

        return achievements;
    }
}

export { DungeonStats };
