# Bot Configuration Guide

## Overview
This guide explains how to configure and customize the bot for your server.

## Environment Variables
Create a `.env` file in the root directory with these variables:

```env
# Required Variables
DISCORD_TOKEN=your_bot_token
OWNER_ID=your_discord_id
GUILD_ID=your_server_id

# Optional Variables
NODE_ENV=production
LOG_LEVEL=info
COMMAND_PREFIX=/
MAX_MEMORY=512
```

### Required Variables
- `DISCORD_TOKEN`: Your Discord bot token
- `OWNER_ID`: Your Discord user ID
- `GUILD_ID`: Your Discord server ID

### Optional Variables
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (debug/info/warn/error)
- `COMMAND_PREFIX`: Command prefix (default: /)
- `MAX_MEMORY`: Maximum memory usage in MB (default: 512)

## Configuration Files

### config/default.json
```json
{
  "bot": {
    "name": "Milena",
    "description": "Personal Discord Bot",
    "version": "1.0.0",
    "owner": {
      "name": "iiRedPanda",
      "github": "https://github.com/iiRedPanda"
    }
  },
  "commands": {
    "cooldown": 3,
    "rateLimit": {
      "global": 100,
      "user": 20
    }
  },
  "games": {
    "maxActive": 10,
    "timeout": 300000,
    "cleanupInterval": 60000
  },
  "logging": {
    "directory": "logs",
    "maxSize": "100m",
    "maxFiles": "14d",
    "format": "combined"
  }
}
```

## Permissions
The bot requires these permissions:
- Send Messages
- Manage Messages
- Read Message History
- Add Reactions
- Use External Emojis
- View Channels

## Rate Limiting
- Global: 100 commands/minute
- Per User: 20 commands/minute
- Per Command: Varies

## Memory Management
- Base Memory: 256MB
- Maximum Memory: 512MB
- Garbage Collection: Automatic

## Logging Configuration
```json
{
  "logging": {
    "levels": {
      "error": 0,
      "warn": 1,
      "info": 2,
      "debug": 3
    },
    "colors": {
      "error": "red",
      "warn": "yellow",
      "info": "green",
      "debug": "blue"
    },
    "files": {
      "error": "logs/errors/error-%DATE%.log",
      "combined": "logs/combined-%DATE%.log"
    }
  }
}
```

## Security Settings
```json
{
  "security": {
    "maxMessageLength": 2000,
    "allowedMentions": {
      "parse": ["users"],
      "repliedUser": true
    },
    "rateLimit": {
      "windowMs": 60000,
      "max": 100
    }
  }
}
```

## Game Settings
```json
{
  "games": {
    "maxPlayers": 10,
    "turnTimeout": 30000,
    "inactivityTimeout": 300000,
    "maxGamesPerChannel": 1
  }
}
```

## Performance Tuning
```json
{
  "performance": {
    "cacheSize": 100,
    "cacheTTL": 3600,
    "maxConcurrentGames": 10,
    "maxMessagesPerChannel": 100
  }
}
```

<!-- 
Internal Notes:
- Monitor memory usage
- Implement auto-scaling
- Add configuration validation
- Consider Redis for caching
-->

## Deployment
1. Set environment variables
2. Configure settings
3. Install dependencies
4. Start the bot

## Troubleshooting
- Check logs in `logs/` directory
- Verify permissions
- Monitor resource usage
- Check rate limits

## Resource Requirements
- CPU: 1 core minimum
- RAM: 512MB minimum
- Storage: 1GB minimum
- Network: 1Mbps minimum
