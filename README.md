# Milena Bot

Milena is a Discord bot with advanced functionalities, including memory management, API integration, and server-specific configurations.

## Features
- **Setup Commands:** Configure allowed channels, roles, and admin roles.
- **Memory Management:** Store and retrieve recent messages for context.
- **Gemini API Integration:** Generate AI responses using the Gemini API.
- **Status Monitoring:** View bot uptime, memory usage, and system load.
- **Help Command:** List all available commands.
- **Log Management:** Automatically rotates and cleans up log files.

## Commands
- `/setup`: Configure bot settings (e.g., allowed channels, roles, admin roles).
- `/config`: View or update configurations.
- `/clear`: Clear memory for the current channel.
- `/status`: View bot status and system information.
- `/help`: Display a list of available commands.
- `/summarize`: Summarize messages in the current channel.
  - Options:
    - Summarize by message IDs.
    - Summarize from the user's last message.
- `/ping`: Replies with "Pong!".

## Functions
- **`testGeminiAPI`**: Tests the Gemini API to ensure it is working and verifies the API key.
- **`fetchGeminiResponse`**: Fetches a response from the Gemini API based on a given prompt.
- **`loadCommands`**: Dynamically loads all command files into the bot.
- **`loadEvents`**: Dynamically loads all event files into the bot.
- **`processMessage`**: Processes a message and logs it.
- **`saveMemory`**: Saves memory data to a JSON file.
- **`saveConfigurations`**: Saves configurations to a JSON file.
- **`summarizeMessages`**: Summarizes messages in a channel between two message IDs.
- **`cleanLogs`**: Cleans up old log files and unnecessary JSON files.

## Logging
- Logs are categorized into levels: `error`, `warn`, `info`, `debug`, `startup`, `runtime`, and `general`.
- Logs are stored in rotating log files:
  - **Info logs**: `logs/info/%DATE%.log`
  - **Error logs**: `logs/errors/%DATE%.log`
  - **Debug logs**: `logs/debug/%DATE%.log`
  - **Startup logs**: `logs/startup/%DATE%.log`
  - **Runtime logs**: `logs/runtime/%DATE%.log`
  - **General logs**: `logs/general/%DATE%.log`
- Utility functions (`logInfo`, `logWarn`, `logError`, `logDebug`, `logStartup`, `logRuntime`, `logGeneral`) are used throughout the code to log messages with metadata.

## How Logging Works
- **Log Levels**:
  - `INFO`: Logs general informational messages.
  - `ERROR`: Logs errors and exceptions.
  - `DEBUG`: Logs detailed debugging information.
  - `STARTUP`: Logs events related to the bot's startup process.
  - `RUNTIME`: Logs runtime errors and issues.
  - `GENERAL`: Logs uncategorized messages.
- **Log Routing**:
  - Each log level is routed to its respective folder without overlap.
  - Logs are rotated daily, with a maximum size of 10 MB per file and retention of 14 days.
- **Error Handling**:
  - Errors during logging (e.g., file write errors) are logged to a dedicated `logging_errors.log` file.

## Contributing
Feel free to submit issues or pull requests to improve the bot.
