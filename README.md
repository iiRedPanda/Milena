# Milena Bot

Milena is a Discord bot with advanced functionalities, including memory management, API integration, and server-specific configurations.

## Features
- **Setup Commands:** Configure allowed channels, roles, and admin roles.
- **Memory Management:** Store and retrieve recent messages for context.
- **Gemini API Integration:** Generate AI responses using the Gemini API.
- **Status Monitoring:** View bot uptime, memory usage, and system load.
- **Help Command:** List all available commands.

## Commands
- `!setup`: Configure bot settings.
- `!config`: View or update configurations.
- `!clear`: Clear memory for the current channel.
- `!status`: View bot status and system information.
- `!help`: Display a list of available commands.

## Setup
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Create a `.env` file with the following variables:
   ```
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_GUILD_ID=your_discord_guild_id
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent
   ```
4. Start the bot: `npm start`.

## Testing
Run tests using:
```
npm test
```

## Contributing
Feel free to submit issues or pull requests to improve the bot.