import { fetchGeminiResponse } from '../../services/ai.js';

class DungeonStoryGenerator {
    constructor() {
        this.prompts = {
            generateStory: `
                Generate a unique dungeon adventure story for a player named {{player}}.
                The story should include:
                - A compelling backstory
                - Multiple branching paths
                - Interesting NPCs and interactions
                - Hidden secrets and lore
                - Multiple endings based on player choices
                - A clear final goal
                Return the story in JSON format with:
                {
                    title: "Story Title",
                    backstory: "Detailed backstory",
                    currentScene: "Starting scene description",
                    choices: [
                        {
                            text: "Choice description",
                            consequences: "Effects of this choice",
                            nextScene: "Next scene ID"
                        }
                    ],
                    ending: null
                }
            `,
            generateScene: `
                Generate the next scene for the dungeon adventure.
                Current story progress: {{currentStory}}
                Player position: {{position}}
                Player stats: {{playerStats}}
                
                Return a JSON object with:
                {
                    description: "Scene description",
                    events: [
                        {
                            type: "event type",
                            description: "Event description",
                            choices: [
                                {
                                    text: "Choice text",
                                    effects: "Effects of this choice"
                                }
                            ]
                        }
                    ]
                }
            `,
            generateEvent: `
                Generate a dynamic event for the dungeon adventure.
                Current story progress: {{currentStory}}
                Player action: {{action}}
                Position: {{position}}
                
                Return a JSON object with:
                {
                    type: "event type",
                    description: "Event description",
                    choices: [
                        {
                            text: "Choice text",
                            effects: "Effects of this choice"
                        }
                    ]
                }
            `,
            generateCombat: `
                Generate a combat narrative for the dungeon adventure.
                Player stats: {{player}}
                Monster: {{monster}}
                
                Return a JSON object with:
                {
                    narrative: "Combat narrative",
                    outcome: "win" | "lose",
                    effects: [
                        {
                            type: "effect type",
                            description: "Effect description"
                        }
                    ]
                }
            `,
            generateHint: `
                Generate a helpful hint for the current dungeon story.
                Current story progress: {{currentStory}}
                Player position: {{position}}
                
                Return a JSON object with:
                {
                    hint: "Helpful hint",
                    suggestion: "Suggested action"
                }
            `,
            generateEnding: `
                Generate a fitting ending for the dungeon adventure.
                Current story progress: {{currentStory}}
                Ending type: {{endingType}}
                Player choices: {{playerChoices}}
                
                Return a JSON object with:
                {
                    title: "Ending title",
                    narrative: "Ending narrative",
                    consequences: "Long-term consequences"
                }
            `
        };
    }

    async generateStory(context) {
        const prompt = this.prompts.generateStory
            .replace('{{player}}', context.player)
            .replace('{{gameType}}', context.gameType)
            .replace('{{difficulty}}', context.difficulty)
            .replace('{{style}}', context.style);

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response);
    }

    async generateScene(game) {
        const prompt = this.prompts.generateScene
            .replace('{{currentStory}}', JSON.stringify(game.story))
            .replace('{{position}}', JSON.stringify({
                x: game.player.x,
                y: game.player.y
            }))
            .replace('{{playerStats}}', JSON.stringify({
                hp: game.player.hp,
                weapon: game.player.weapon?.name,
                armor: game.player.armor?.name
            }));

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response).description;
    }

    async generateEvent(game, eventContext) {
        const prompt = this.prompts.generateEvent
            .replace('{{currentStory}}', JSON.stringify(game.story))
            .replace('{{action}}', eventContext.action)
            .replace('{{position}}', JSON.stringify(eventContext.position));

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response);
    }

    async generateCombat(game, player, monster) {
        const prompt = this.prompts.generateCombat
            .replace('{{player}}', JSON.stringify({
                name: player.name,
                hp: player.hp,
                weapon: player.weapon?.name,
                armor: player.armor?.name
            }))
            .replace('{{monster}}', JSON.stringify({
                name: monster.name,
                hp: monster.hp,
                damage: monster.damage
            }));

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response);
    }

    async generateHint(game) {
        const prompt = this.prompts.generateHint
            .replace('{{currentStory}}', JSON.stringify(game.story))
            .replace('{{position}}', JSON.stringify({
                x: game.player.x,
                y: game.player.y
            }));

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response).hint;
    }

    async generateCurrentStory(game) {
        const prompt = this.prompts.generateCurrentStory
            .replace('{{currentStory}}', JSON.stringify(game.story))
            .replace('{{choices}}', JSON.stringify(game.player.choices));

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response);
    }

    async generateEnding(game, endingType) {
        const prompt = this.prompts.generateEnding
            .replace('{{currentStory}}', JSON.stringify(game.story))
            .replace('{{endingType}}', endingType)
            .replace('{{playerChoices}}', JSON.stringify(game.player.choices));

        const response = await fetchGeminiResponse(prompt);
        return JSON.parse(response);
    }
}

export { DungeonStoryGenerator };
