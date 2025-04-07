import { GameBase } from '../GameBase.js';

export class HangmanGame extends GameBase {
    constructor() {
        super({
            timeout: 300000, // 5 minutes
            maxGuesses: 6,
            categories: {
                ANIMALS: ['elephant', 'giraffe', 'penguin', 'dolphin', 'kangaroo', 'octopus', 'butterfly'],
                FRUITS: ['banana', 'strawberry', 'pineapple', 'blueberry', 'watermelon', 'orange', 'mango'],
                COUNTRIES: ['france', 'japan', 'brazil', 'australia', 'canada', 'egypt', 'india'],
                SPORTS: ['football', 'tennis', 'basketball', 'volleyball', 'swimming', 'cricket', 'hockey'],
                FOOD: ['pizza', 'hamburger', 'spaghetti', 'chocolate', 'sandwich', 'pancake', 'icecream'],
                JOBS: ['teacher', 'doctor', 'engineer', 'artist', 'musician', 'chef', 'pilot']
            }
        });

        this.hangmanStages = [
            '\`\`\`\n  +---+\n      |\n      |\n      |\n      |\n      |\n=========\`\`\`',
            '\`\`\`\n  +---+\n  O    |\n      |\n      |\n      |\n      |\n=========\`\`\`',
            '\`\`\`\n  +---+\n  O    |\n  |    |\n      |\n      |\n      |\n=========\`\`\`',
            '\`\`\`\n  +---+\n  O    |\n /|    |\n      |\n      |\n      |\n=========\`\`\`',
            '\`\`\`\n  +---+\n  O    |\n /|\   |\n      |\n      |\n      |\n=========\`\`\`',
            '\`\`\`\n  +---+\n  O    |\n /|\   |\n /     |\n      |\n      |\n=========\`\`\`',
            '\`\`\`\n  +---+\n  O    |\n /|\   |\n / \   |\n      |\n      |\n=========\`\`\`'
        ];

        this.word = '';
        this.guesses = [];
        this.category = '';
        this.wrongGuesses = 0;
    }

    async startGame(interaction, category) {
        if (this.gameState !== 'waiting') {
            await interaction.reply({ content: 'A game is already in progress!', ephemeral: true });
            return;
        }

        this.category = category || 'ANIMALS';
        this.word = this.categories[this.category][Math.floor(Math.random() * this.categories[this.category].length)];
        this.guesses = [];
        this.wrongGuesses = 0;
        this.gameState = 'active';

        const displayWord = this.getDisplayWord();
        const hangmanStage = this.hangmanStages[this.wrongGuesses];

        await interaction.reply({
            content: `🎮 Hangman Game (${this.category})\n\n${hangmanStage}\n\nWord: ${displayWord}\nGuesses left: ${this.maxGuesses - this.wrongGuesses}\n\nGuess a letter!`,
            components: this.getGameComponents()
        });
    }

    async makeGuess(interaction, letter) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const lowerCaseLetter = letter.toLowerCase();
        if (this.guesses.includes(lowerCaseLetter)) {
            await interaction.reply({ content: `You already guessed ${letter}! Try another letter.`, ephemeral: true });
            return;
        }

        this.guesses.push(lowerCaseLetter);
        const displayWord = this.getDisplayWord();
        const hangmanStage = this.hangmanStages[this.wrongGuesses];

        if (this.word.includes(lowerCaseLetter)) {
            await interaction.reply({
                content: `✅ Correct! ${letter} is in the word.\n\n${hangmanStage}\n\nWord: ${displayWord}\nGuesses left: ${this.maxGuesses - this.wrongGuesses}`,
                components: this.getGameComponents()
            });

            if (!displayWord.includes('_')) {
                await interaction.followUp({
                    content: `🏆 Congratulations! You guessed the word: ${this.word.toUpperCase()}`,
                    components: []
                });
                this.gameState = 'finished';
            }
        } else {
            this.wrongGuesses++;
            await interaction.reply({
                content: `❌ Wrong! ${letter} is not in the word.\n\n${hangmanStage}\n\nWord: ${displayWord}\nGuesses left: ${this.maxGuesses - this.wrongGuesses}`,
                components: this.getGameComponents()
            });

            if (this.wrongGuesses >= this.maxGuesses) {
                await interaction.followUp({
                    content: `💀 Game Over! The word was: ${this.word.toUpperCase()}`,
                    components: []
                });
                this.gameState = 'finished';
            }
        }
    }

    getDisplayWord() {
        return this.word.split('').map(letter => 
            this.guesses.includes(letter) ? letter : '_'
        ).join(' ');
    }

    getGameComponents() {
        const buttons = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
        
        const components = [];
        
        for (let i = 0; i < Math.ceil(buttons.length / 5); i++) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 5; j++) {
                const index = i * 5 + j;
                if (index < buttons.length) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`guess_${buttons[index]}`)
                            .setLabel(buttons[index].toUpperCase())
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(this.guesses.includes(buttons[index]))
                    );
                }
            }
            components.push(row);
        }

        return components;
    }
}

export default HangmanGame;
