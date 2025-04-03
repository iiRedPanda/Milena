import jokeCommand from '../src/commands/joke.js';
import { fetchGeminiResponse } from '../src/ai.js';
import axios from 'axios';

jest.mock('axios');
jest.mock('../src/ai.js');

describe('/joke Command', () => {
    it('should fetch a joke from the API and reply', async () => {
        const mockInteraction = {
            reply: jest.fn(),
        };
        axios.get.mockResolvedValue({
            data: { type: 'single', joke: 'This is a test joke.' },
        });

        await jokeCommand.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'This is a test joke.',
            ephemeral: false,
        });
    });

    it('should use fallback jokes if API fails', async () => {
        const mockInteraction = {
            reply: jest.fn(),
        };
        axios.get.mockRejectedValue(new Error('API Error'));
        fetchGeminiResponse.mockRejectedValue(new Error('Gemini Error'));

        await jokeCommand.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: expect.stringMatching(/Why don’t skeletons fight each other/),
            ephemeral: false,
        });
    });
});
