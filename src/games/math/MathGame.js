import { GameBase } from '../GameBase.js';

export class MathGame extends GameBase {
    constructor() {
        super({
            timeout: 30000, // 30 seconds per problem
            difficultyLevels: {
                easy: {
                    maxNumber: 10,
                    operations: ['+', '-']
                },
                medium: {
                    maxNumber: 100,
                    operations: ['+', '-', '*', '/']
                },
                hard: {
                    maxNumber: 1000,
                    operations: ['+', '-', '*', '/', '**']
                }
            },
            problemTypes: {
                addition: '+',
                subtraction: '-',
                multiplication: '*',
                division: '/',
                exponent: '**'
            }
        });

        this.currentProblem = null;
        this.correctAnswers = 0;
        this.totalTime = 0;
        this.currentStreak = 0;
        this.bestStreak = 0;
        this.score = 0;
    }

    async startGame(interaction, type, difficulty) {
        if (this.gameState !== 'waiting') {
            await interaction.reply({ content: 'A game is already in progress!', ephemeral: true });
            return;
        }

        this.type = type || 'addition';
        this.difficulty = difficulty || 'easy';
        this.gameState = 'active';
        this.startTime = Date.now();

        const problem = this.generateProblem(this.difficulty, this.type);
        this.currentProblem = problem;

        await interaction.reply({
            content: `🎮 Math Game (${this.difficulty})\n\nSolve this ${this.type} problem:\n\n${problem.question}\n\nTime limit: 30 seconds`,
            components: this.getGameComponents()
        });
    }

    generateProblem(difficulty, type) {
        const level = this.difficultyLevels[difficulty];
        const operation = this.problemTypes[type];
        const maxNumber = level.maxNumber;

        let num1, num2, question, answer;

        switch (operation) {
            case '+':
                num1 = Math.floor(Math.random() * maxNumber) + 1;
                num2 = Math.floor(Math.random() * maxNumber) + 1;
                question = `${num1} + ${num2}`;
                answer = num1 + num2;
                break;
            case '-':
                num1 = Math.floor(Math.random() * maxNumber) + 1;
                num2 = Math.floor(Math.random() * Math.min(num1, maxNumber)) + 1;
                question = `${num1} - ${num2}`;
                answer = num1 - num2;
                break;
            case '*':
                num1 = Math.floor(Math.random() * Math.sqrt(maxNumber)) + 1;
                num2 = Math.floor(Math.random() * Math.sqrt(maxNumber)) + 1;
                question = `${num1} × ${num2}`;
                answer = num1 * num2;
                break;
            case '/':
                num2 = Math.floor(Math.random() * Math.sqrt(maxNumber)) + 1;
                num1 = num2 * Math.floor(Math.random() * Math.sqrt(maxNumber)) + 1;
                question = `${num1} ÷ ${num2}`;
                answer = num1 / num2;
                break;
            case '**':
                num1 = Math.floor(Math.random() * Math.log(maxNumber)) + 1;
                num2 = Math.floor(Math.random() * Math.log(maxNumber)) + 1;
                question = `${num1} ^ ${num2}`;
                answer = Math.pow(num1, num2);
                break;
        }

        return {
            question,
            answer,
            operation,
            difficulty
        };
    }

    async checkAnswer(interaction, userAnswer) {
        if (this.gameState !== 'active') {
            await interaction.reply({ content: 'No active game found!', ephemeral: true });
            return;
        }

        const correctAnswer = this.currentProblem.answer;
        const isCorrect = parseFloat(userAnswer) === correctAnswer;
        const timeTaken = Date.now() - this.startTime;
        this.totalTime += timeTaken;

        if (isCorrect) {
            this.correctAnswers++;
            this.currentStreak++;
            this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
            this.score += this.calculateScore(timeTaken, true);

            const nextProblem = this.generateProblem(this.difficulty, this.type);
            this.currentProblem = nextProblem;
            this.startTime = Date.now();

            await interaction.reply({
                content: `✅ Correct!\n\nScore: ${this.score}\nStreak: ${this.currentStreak}\n\nNext problem:\n${nextProblem.question}`,
                components: this.getGameComponents()
            });
        } else {
            this.currentStreak = 0;
            this.score += this.calculateScore(timeTaken, false);

            await interaction.reply({
                content: `❌ Wrong! The correct answer was: ${correctAnswer}\n\nScore: ${this.score}\nStreak: ${this.currentStreak}`,
                components: []
            });
            this.gameState = 'finished';
        }
    }

    calculateScore(timeTaken, correct) {
        const baseScore = correct ? 100 : -50;
        const timeBonus = correct ? Math.max(0, 100 - (timeTaken / 1000)) : 0;
        const streakBonus = this.currentStreak * 10;
        return baseScore + timeBonus + streakBonus;
    }

    getGameComponents() {
        const components = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('check_answer')
                    .setLabel('Check Answer')
                    .setStyle(ButtonStyle.Primary)
            );

        return [components];
    }
}

export default MathGame;
