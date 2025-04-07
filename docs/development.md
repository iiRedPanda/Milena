# Development Guide

## Overview
This guide provides information for developers working on the Milena Discord bot.

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- NPM >= 8.0.0
- Git
- Discord Developer Account
- IDE with JavaScript support

### Development Environment Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/iiRedPanda/Milena.git
   cd Milena
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file:
   ```env
   DISCORD_TOKEN=your_bot_token
   OWNER_ID=your_discord_id
   GUILD_ID=your_server_id
   NODE_ENV=development
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Project Structure
```
milena/
├── src/               # Source code
│   ├── commands/     # Command implementations
│   │   ├── admin/   # Admin commands
│   │   ├── fun/    # Fun commands
│   │   ├── games/  # Game commands
│   │   └── utility/ # Utility commands
│   ├── core/        # Core functionality
│   │   ├── BaseCommand.js
│   │   ├── EventManager.js
│   │   └── Logger.js
│   ├── games/       # Game implementations
│   │   ├── GameBase.js
│   │   └── GameManager.js
│   └── utils/       # Utility functions
├── docs/             # Documentation
├── logs/             # Log files
└── tests/            # Test files
```

## Code Style
- Use ES6+ features
- Follow ESLint configuration
- Use JSDoc comments
- Follow naming conventions:
  - PascalCase for classes
  - camelCase for variables/functions
  - UPPER_CASE for constants

## Creating Commands

### Command Structure
```javascript
import { BaseCommand } from '../../core/BaseCommand.js';

class ExampleCommand extends BaseCommand {
    constructor() {
        super({
            name: 'example',
            description: 'Example command',
            category: 'utility',
            permissions: ['SEND_MESSAGES'],
            cooldown: 3
        });
    }

    async run(interaction) {
        // Command implementation
    }
}

export default new ExampleCommand();
```

### Command Categories
1. Admin: Server management
2. Fun: Entertainment features
3. Games: Interactive games
4. Utility: Helper functions

## Creating Games

### Game Structure
```javascript
import { GameBase } from './GameBase.js';

class ExampleGame extends GameBase {
    constructor(options) {
        super({
            ...options,
            minPlayers: 2,
            maxPlayers: 4,
            timeout: 30000
        });
    }

    initialize() {
        // Game setup
    }

    processMove(interaction, move) {
        // Process player move
    }

    checkWinCondition() {
        // Check if game is won
    }
}
```

## Testing
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Coverage: `npm run test:coverage`

## Debugging
1. Use VSCode debugger
2. Check logs in `logs/` directory
3. Use debug logging:
   ```javascript
   logger.debug('Debug message', { context: 'value' });
   ```

## Error Handling
```javascript
try {
    // Risky operation
} catch (error) {
    logger.error('Operation failed', {
        error: error.message,
        context: 'value'
    });
    throw new Error('User-friendly message');
}
```

## Performance Tips
1. Use async/await properly
2. Implement caching where appropriate
3. Optimize database queries
4. Use efficient algorithms
5. Profile memory usage

## Security Guidelines
1. Validate all input
2. Use permission checks
3. Implement rate limiting
4. Sanitize output
5. Use secure dependencies

## Documentation
1. Use JSDoc comments
2. Document complex logic
3. Keep README updated
4. Create diagrams for complex systems

## Git Workflow
1. Create feature branch
2. Make changes
3. Run tests
4. Create pull request
5. Get code review
6. Merge to main

## Deployment
1. Update version
2. Run tests
3. Build production
4. Deploy to server
5. Monitor logs

## Monitoring
- Check error rates
- Monitor performance
- Track resource usage
- Watch user patterns

<!-- 
Internal Development Notes:
- Consider TypeScript migration
- Implement CI/CD pipeline
- Add performance benchmarks
- Create development container
-->

## Best Practices
1. Follow SOLID principles
2. Write clean, readable code
3. Keep functions small
4. Use meaningful names
5. Write good tests

## Resources
- [Discord.js Guide](https://discordjs.guide/)
- [Node.js Docs](https://nodejs.org/docs)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Jest Testing](https://jestjs.io/docs/)
