# Milena Bot

Milena is a Discord bot with advanced functionalities, including memory management, API integration, and server-specific configurations.

---

## Features
- **Setup Commands:** Configure allowed channels, roles, and admin roles.
- **Memory Management:** Store and retrieve recent messages for context.
- **Gemini API Integration:** Generate AI responses using the Gemini API.
- **Status Monitoring:** View bot uptime, memory usage, and system load.
- **Help Command:** List all available commands.
- **Log Management:** Automatically rotates and cleans up log files.
- **Message Deletion:** Delete a specified number of past messages in a channel.
- **Customizable Memory Clearing:** Clear memory for a channel based on a specific duration.
- **Global Memory Pruning:** Configure a global interval for pruning old memory across all channels.

---

## Commands

<details>
<summary><strong>/setup</strong></summary>
Configure bot settings (e.g., allowed channels, roles, admin roles).
</details>

<details>
<summary><strong>/config</strong></summary>
View or update configurations.
</details>

<details>
<summary><strong>/clearmemory</strong></summary>
Clear memory for the current channel.
- **Options**:
  - Clear memory by specifying a number of days or hours.
  - Example: `/clearmemory duration_type:days duration_value:3` clears memory from the past 3 days.
</details>

<details>
<summary><strong>/delete</strong></summary>
Delete a specified number of past messages in the current channel.
- **Example**: `/delete amount:8` deletes the last 8 messages in the channel.
- **Note**: Messages older than 14 days cannot be deleted due to Discord API limitations. The bot will notify you if any messages could not be deleted.
</details>

<details>
<summary><strong>/memoryprune</strong></summary>
Configure the global memory pruning interval.
- **Options**:
  - Set the pruning interval by specifying days or hours.
  - Example: `/memoryprune duration_type:hours duration_value:48` sets the pruning interval to 48 hours globally.
- **Note**: The pruning interval applies globally to all channels.
</details>

<details>
<summary><strong>/status</strong></summary>
View bot status and system information.
- **Details**:
  - Uptime
  - Memory usage
  - System load
</details>

<details>
<summary><strong>/help</strong></summary>
Display a list of available commands.
</details>

<details>
<summary><strong>/summarize</strong></summary>
Summarize messages in the current channel.
- **Options**:
  - Summarize by message IDs.
  - Summarize from the user's last message.
</details>

<details>
<summary><strong>/ping</strong></summary>
Replies with "Pong!".
</details>

---

## Functions

<details>
<summary><strong>Core Functions</strong></summary>

- **`testGeminiAPI`**: Tests the Gemini API to ensure it is working and verifies the API key.
- **`fetchGeminiResponse`**: Fetches a response from the Gemini API based on a given prompt.
- **`loadCommands`**: Dynamically loads all command files into the bot.
- **`loadEvents`**: Dynamically loads all event files into the bot.
- **`processMessage`**: Processes a message and logs it.
- **`saveMemory`**: Saves memory data to a JSON file.
- **`saveConfigurations`**: Saves configurations to a JSON file.
- **`summarizeMessages`**: Summarizes messages in a channel between two message IDs.
- **`cleanLogs`**: Cleans up old log files and unnecessary JSON files.
- **`pruneMemory`**: Prunes old memory globally based on the configured interval.

</details>

---

## Logging

<details>
<summary><strong>How Logging Works</strong></summary>

- **Log Levels**:
  - `INFO`: Logs general informational messages.
  - `ERROR`: Logs errors and exceptions.
  - `DEBUG`: Logs detailed debugging information.
  - `STARTUP`: Logs events related to the bot's startup process.
  - `RUNTIME`: Logs runtime errors and issues.
  - `GENERAL`: Logs uncategorized messages.
- **Log Routing**:
  - Each log level is routed to its respective folder without overlap.
  - Logs are rotated daily, with a maximum size of 10 MB per file and retention of 7 days.
- **Error Handling**:
  - Errors during logging (e.g., file write errors) are logged to a dedicated `logging_errors.log` file.

</details>

---

<!--
## Setting Up the .env File
To configure the bot, create a `.env` file in the root directory of the project. The file should contain the following keys:

```
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_discord_guild_id
GEMINI_API_KEY=your_gemini_api_key
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent
```

Replace the placeholder values (`your_discord_bot_token`, etc.) with your actual credentials.
-->

---

## Troubleshooting

### Common Issues
1. **Messages Not Deleted**:
   - Messages older than 14 days cannot be deleted due to Discord API limitations. Use `/delete` for messages within the 14-day limit.

2. **Memory Not Pruned**:
   - Ensure the `/memoryprune` command has been used to set a valid pruning interval.
   - Check the logs for errors during the pruning process.

3. **Missing `.env` File**:
   - Ensure you have created a `.env` file in the root directory with the required keys.

4. **Invalid API Key**:
   - Verify that the `GEMINI_API_KEY` in your `.env` file is correct.

5. **Bot Not Responding**:
   - Check if the bot has the necessary permissions in the Discord server.
   - Ensure the bot is running and connected to the correct guild.

6. **Command Not Found**:
   - Verify that the command is registered and loaded correctly.

---

## Contributing
Feel free to submit issues or pull requests to improve the bot.

---

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.
