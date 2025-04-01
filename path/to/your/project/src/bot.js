const { Client, GatewayIntentBits } = require('discord.js');
const { CHANNEL_BEHAVIOR } = require('./constants');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

module.exports = { client, CHANNEL_BEHAVIOR };