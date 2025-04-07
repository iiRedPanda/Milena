import { GameBase } from '../GameBase.js';
import { logger } from '../../core/logger.js';
import { fetch } from 'node-fetch';

export class WordChainGame extends GameBase {
    constructor(channelId) {
        super({
            timeout: 600000, // 10 minutes
            minWordLength: 3,
            turnTimeout: 30000 // 30 seconds per turn
        });
        
        this.channelId = channelId;
        this.dictionary = new Set();
        this.currentWord = null;
        this.wordHistory = [];
        this.lastPlayed = null;
        this.activePlayers = new Set();
        this.loadDictionary();
    }

    async loadDictionary() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt');
            const text = await response.text();
            const words = text.split('\n').filter(word => word.length >= this.minWordLength);
            this.dictionary = new Set(words);
            logger.info(`Loaded ${this.dictionary.size} words into dictionary`);
        } catch (error) {
            logger.error('Error loading dictionary:', error);
            // Fallback to a smaller dictionary
            const commonWords = ['apple', 'banana', 'orange', 'grape', 'kiwi', 'melon', 'pear',
                               'carrot', 'potato', 'tomato', 'cucumber', 'pepper', 'onion',
                               'bread', 'milk', 'cheese', 'butter', 'eggs', 'flour', 'sugar'];
            this.dictionary = new Set(commonWords);
        }
    }

    async handleWord(message, word) {
        if (message.channel.id !== this.channelId) return;

        // If game hasn't started yet, start with this word
        if (!this.currentWord) {
            if (this.validateWord(word)) {
                this.currentWord = word.toLowerCase();
                this.wordHistory.push(word.toLowerCase());
                this.activePlayers.add(message.author.id);
                this.lastPlayed = message.author.id;

                await message.reply(`🎮 Word Chain Game Started!\n\nFirst word: ${word}\n\nNext player: ${message.author.username}'s turn`);
                return;
            }
        }

        // Check if it's their turn
        if (message.author.id === this.lastPlayed) {
            await message.reply(`❌ You just played! Wait for others to play first.`);
            return;
        }

        // Validate the word
        if (!this.validateWord(word)) {
            await message.reply(`❌ Invalid word! Make sure it exists and follows the rules.`);
            return;
        }

        // Check if it matches the last word
        if (!this.checkChain(this.currentWord, word)) {
            await message.reply(`❌ ${word} doesn't start with ${this.currentWord[this.currentWord.length - 1]}!`);
            return;
        }

        // Update game state
        this.currentWord = word.toLowerCase();
        this.wordHistory.push(word.toLowerCase());
        this.activePlayers.add(message.author.id);
        this.lastPlayed = message.author.id;

        // Get next player who hasn't played last
        const nextPlayer = Array.from(this.activePlayers)
            .find(playerId => playerId !== this.lastPlayed);
        
        await message.reply(`✅ ${message.author} played: ${word}\n\nNew word: ${word}\n\nNext player: ${nextPlayer ? `<@${nextPlayer}>` : 'Anyone!'}`);
    }

    validateWord(word) {
        word = word.toLowerCase();
        
        // Check if word exists in dictionary
        if (!this.dictionary.has(word)) {
            return false;
        }

        // Check word length
        if (word.length < this.minWordLength) {
            return false;
        }

        // Check if word has been used before
        if (this.wordHistory.includes(word.toLowerCase())) {
            return false;
        }

        return true;
    }

    checkChain(word1, word2) {
        return word2[0].toLowerCase() === word1[word1.length - 1].toLowerCase();
    }

    async showRules(message) {
        if (message.channel.id !== this.channelId) return;

        const rules = `
1. Type any word to start the game
2. Each word must start with the last letter of the previous word
3. Minimum word length: ${this.minWordLength} letters
4. No repeating words
5. No proper nouns or abbreviations
6. Players take turns - no playing twice in a row
7. Game continues until someone enters an invalid word
8. Turn timeout: ${this.turnTimeout / 1000} seconds
`;

        await message.reply(`🎮 Word Chain Rules:\n\n${rules}`);
    }

    async showStats(message) {
        if (message.channel.id !== this.channelId) return;

        if (!this.currentWord) {
            await message.reply('No game in progress!');
            return;
        }

        await message.reply(`📊 Game Stats:\n\nCurrent word: ${this.currentWord}\nWords played: ${this.wordHistory.length}\nLast player: <@${this.lastPlayed}>\n\nActive players:\n${Array.from(this.activePlayers)
    .map(playerId => `<@${playerId}>`)
    .join('\n')}`);
    }
}

export default WordChainGame;
