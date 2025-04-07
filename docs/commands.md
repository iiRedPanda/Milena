# Bot Commands

## Overview
This document lists all available commands in the bot. Commands are organized by category and require specific permissions to use.

## Command Categories

### 🛠️ Admin Commands
| Command | Description | Usage | Permissions |
|---------|-------------|--------|-------------|
| `/clearmemory` | Clear message history | `/clearmemory [duration] [type]` | ADMINISTRATOR |
| `/config` | View/edit bot configuration | `/config [key] [value]` | ADMINISTRATOR |
| `/memoryprune` | Prune old memory entries | `/memoryprune [days]` | ADMINISTRATOR |
| `/setup` | Initial bot setup | `/setup` | ADMINISTRATOR |

### 🎮 Game Commands
| Command | Description | Usage | Permissions |
|---------|-------------|--------|-------------|
| `/tictactoe` | Start Tic Tac Toe game | `/tictactoe [opponent]` | SEND_MESSAGES |
| `/hangman` | Start Hangman game | `/hangman` | SEND_MESSAGES |
| `/wordchain` | Start Word Chain game | `/wordchain` | SEND_MESSAGES |
| `/mathgame` | Start Math game | `/mathgame [difficulty]` | SEND_MESSAGES |
| `/quiz` | Start a quiz | `/quiz [category]` | SEND_MESSAGES |
| `/dungeon` | Start Dungeon Adventure | `/dungeon` | SEND_MESSAGES |

### 🎯 Utility Commands
| Command | Description | Usage | Permissions |
|---------|-------------|--------|-------------|
| `/summarize` | Summarize chat history | `/summarize [messages] [method]` | SEND_MESSAGES |
| `/poll` | Create a poll | `/poll [question] [options]` | SEND_MESSAGES |

### 🎨 Fun Commands
| Command | Description | Usage | Permissions |
|---------|-------------|--------|-------------|
| `/joke` | Tell a joke | `/joke [category]` | SEND_MESSAGES |
| `/quote` | Get a random quote | `/quote [category]` | SEND_MESSAGES |
| `/story` | Generate a story | `/story [theme]` | SEND_MESSAGES |

## Command Details

### Admin Commands

#### `/clearmemory`
Clears message history from a channel.
- Options:
  - `duration`: Time period to clear (1h, 1d, 7d, etc.)
  - `type`: Type of messages to clear (all, bot, user)
- Examples:
  ```
  /clearmemory 1d all
  /clearmemory 7d bot
  ```

#### `/config`
View or modify bot configuration.
- Options:
  - `key`: Configuration key
  - `value`: New value (optional)
- Examples:
  ```
  /config view prefix
  /config set prefix !
  ```

### Game Commands

#### `/tictactoe`
Start a game of Tic Tac Toe.
- Options:
  - `opponent`: User to challenge (optional)
- Features:
  - 3x3 grid
  - Turn-based gameplay
  - Win detection
  - Timeout handling

#### `/hangman`
Classic Hangman word guessing game.
- Features:
  - Word categories
  - Visual display
  - Score tracking
  - Multiple difficulties

### Utility Commands

#### `/summarize`
Summarize chat history using AI.
- Options:
  - `messages`: Number of messages (default: 50)
  - `method`: Summarization method (ai, simple)
- Examples:
  ```
  /summarize 100 ai
  /summarize 50 simple
  ```

#### `/poll`
Create interactive polls.
- Options:
  - `question`: Poll question
  - `options`: Poll options (comma-separated)
- Features:
  - Multiple choice
  - Timed polls
  - Result display

## Command Permissions
- ADMINISTRATOR: Full access to all commands
- MANAGE_MESSAGES: Message management commands
- SEND_MESSAGES: Basic command usage

## Rate Limits
- Global: 100 commands per minute
- Per User: 20 commands per minute
- Per Command: Varies by command type

## Error Handling
All commands include:
- Input validation
- Error messages
- Timeout handling
- Permission checks

<!-- 
Internal Notes:
- Monitor command usage patterns
- Track error rates by command
- Consider adding command aliases
- Implement command suggestions
-->
