const { describe, it, expect, jest } = require('@jest/globals');
const axios = require('axios');
const { makeGeminiRequest } = require('../index');

jest.mock('axios');

describe('makeGeminiRequest', () => {
    it('should return generated text when API call is successful', async () => {
        const mockResponse = {
            data: {
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Hello, world!' }],
                        },
                    },
                ],
            },
        };
        axios.post.mockResolvedValue(mockResponse);

        const result = await makeGeminiRequest('Test prompt');
        expect(result).toBe('Hello, world!');
    });

    it('should throw an error when no response text is found', async () => {
        const mockResponse = { data: { candidates: [] } };
        axios.post.mockResolvedValue(mockResponse);

        await expect(makeGeminiRequest('Test prompt')).rejects.toThrow('No response text found in Gemini API response.');
    });

    it('should retry on API failure', async () => {
        axios.post.mockRejectedValueOnce(new Error('Network Error'));
        axios.post.mockResolvedValueOnce({
            data: {
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Retry success!' }],
                        },
                    },
                ],
            },
        });

        const result = await makeGeminiRequest('Test prompt');
        expect(result).toBe('Retry success!');
    });
});

describe('Bot Commands', () => {
    it('should respond with help message when !help is sent', async () => {
        const message = {
            content: '!help',
            reply: jest.fn(),
            author: { bot: false },
        };

        await client.emit('messageCreate', message);
        expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('Milena Bot Commands'));
    });

    it('should clear memory when !clear is sent', async () => {
        const message = {
            content: '!clear',
            channel: { id: 'testChannel' },
            reply: jest.fn(),
            author: { bot: false },
        };

        memory['testChannel'] = [{ user: 'testUser', content: 'testMessage' }];
        await client.emit('messageCreate', message);
        expect(memory['testChannel']).toEqual([]);
        expect(message.reply).toHaveBeenCalledWith('Memory for this channel has been cleared.');
    });
});

describe('Setup Commands', () => {
    it('should allow administrators to configure allowed channels', async () => {
        const message = {
            content: '!setup allowChannel #general',
            member: { permissions: { has: jest.fn(() => true) } },
            mentions: { channels: new Map([['general', { id: '12345' }]]) },
            guild: { id: 'server1' },
            reply: jest.fn(),
        };

        await client.emit('messageCreate', message);
        expect(configurations['server1'].allowedChannels).toContain('12345');
        expect(message.reply).toHaveBeenCalledWith('Channel <#12345> has been allowed.');
    });

    it('should prevent non-administrators from using setup commands', async () => {
        const message = {
            content: '!setup allowChannel #general',
            member: { permissions: { has: jest.fn(() => false) } },
            reply: jest.fn(),
        };

        await client.emit('messageCreate', message);
        expect(message.reply).toHaveBeenCalledWith('You need to be an administrator to use this command.');
    });
});

describe('Rate Limiting', () => {
    it('should limit requests from the same user within 3 seconds', () => {
        const userId = 'testUser';
        expect(isRateLimited(userId)).toBe(false);
        expect(isRateLimited(userId)).toBe(true);
    });
});

describe('Error Notification', () => {
    it('should notify the error channel if configured', async () => {
        const mockChannel = { send: jest.fn() };
        client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

        await notifyErrorChannel(new Error('Test Error'), { serverId: 'testServer' });
        expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('An error occurred'));
    });
});
