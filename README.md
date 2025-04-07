# Milena's Game Collection

Welcome to Milena's collection of fun and engaging games! Each game offers unique challenges and features. Use the dropdowns below to explore the rules and commands for each game.

## Project Structure

```
milena/
├── src/
│   ├── commands/          # Command handlers
│   │   └── games/         # Game-specific commands
│   │       ├── dungeon.js # Dungeon command handler
│   │       └── ...
│   ├── games/             # Game implementations
│   │   ├── GameBase.js   # Base game class
│   │   ├── GameManager.js # Game management
│   │   ├── dungeon/      # Dungeon Adventure game
│   │   │   ├── DungeonGame.js      # Main game implementation
│   │   │   ├── dungeonStats.js     # Game statistics
│   │   │   └── storyGenerator.js   # Story generation
│   │   ├── hangman/      # Hangman game
│   │   │   └── HangmanGame.js     # Main game implementation
│   │   ├── math/         # Math Games
│   │   │   └── MathGame.js       # Main game implementation
│   │   ├── tictactoe/    # Tic Tac Toe
│   │   │   └── TicTacToeGame.js  # Main game implementation
│   │   └── wordchain/    # Word Chain
│   │       └── WordChainGame.js   # Main game implementation
│   ├── core/             # Core functionality
│   ├── services/         # External services integration
│   └── ...
└── ...
```

## Available Games

<details>
  <summary><strong> Dungeon Adventure</strong></summary>

  **A text-based dungeon exploration game with multiple difficulty levels.**

  ### How to Play
  - Use `/dungeon start` to begin your adventure
  - Navigate through the dungeon using `/dungeon explore`
  - Battle monsters with `/dungeon attack`
  - Manage your inventory with `/dungeon inventory`
  - Track your progress with `/dungeon stats`

  ### Commands
  ```
  /dungeon start <mode>
    Modes: explorer | adventurer | hero
    Example: /dungeon start explorer

  /dungeon explore
    Explore the dungeon
    Example: /dungeon explore

  /dungeon attack <target>
    Attack monsters
    Targets: monster | enemy | boss
    Example: /dungeon attack monster

  /dungeon use <item>
    Use items from your inventory
    Example: /dungeon use potion

  /dungeon inventory
    View your items and equipment
    Example: /dungeon inventory

  /dungeon stats
    View your progress and achievements
    Example: /dungeon stats
  ```

  ### Modes
  - Explorer (15 minutes)
    - Easy monsters
    - Basic equipment
    - Quick completion
  - Adventurer (30 minutes)
    - Moderate difficulty
    - Better rewards
    - More challenges
  - Hero (60 minutes)
    - Hard monsters
    - Legendary equipment
    - Ultimate challenge

  ### Achievements
  - First Steps: Complete your first dungeon
  - Quick Master: Complete 5 quick mode games
  - Normal Master: Complete 5 normal mode games
  - Legendary Hero: Achieve all master achievements
  - Boss Slayer: Defeat all boss monsters
  - Treasure Hunter: Find all hidden treasures

</details>

<details>
  <summary><strong> Hangman</strong></summary>

  **A classic word guessing game with multiple categories.**

  ### How to Play
  - Start a game with `/hangman start`
  - Choose a category
  - Guess letters using the interactive buttons
  - Try to guess the word before running out of guesses

  ### Commands
  ```
  /hangman start <category>
    Categories:
    - animals
    - fruits
    - countries
    - sports
    - food
    - jobs
    Example: /hangman start animals

  /hangman stats
    View your performance
    Example: /hangman stats
  ```

  ### Categories
  - Animals: Lions, tigers, bears, and more
  - Fruits: Apples, bananas, oranges, and more
  - Countries: France, Japan, Brazil, and more
  - Sports: Football, basketball, tennis, and more
  - Food: Pizza, pasta, sushi, and more
  - Jobs: Doctor, teacher, engineer, and more

  ### Features
  - 6 wrong guesses allowed
  - Visual hangman stages
  - Category-specific word lists
  - Interactive letter buttons
  - Score tracking
  - Achievement system

</details>

<details>
  <summary><strong> Math Games</strong></summary>

  **Challenge your math skills with various operations and difficulties.**

  ### How to Play
  - Start a challenge with `/math start`
  - Choose your operation and difficulty
  - Solve problems as fast as you can
  - Compete for the highest score

  ### Commands
  ```
  /math start <type> <difficulty>
    Types:
    - add | addition
    - sub | subtraction
    - mul | multiplication
    - div | division
    - exp | exponent
    
    Difficulties:
    - easy
    - medium
    - hard
    
    Example: /math start add medium
  ```

  ### Types
  - Addition (+): Simple sums
  - Subtraction (-): Basic differences
  - Multiplication (*): Products
  - Division (/): Quotients
  - Exponent (^): Powers

  ### Difficulties
  - Easy: Numbers up to 10
  - Medium: Numbers up to 100
  - Hard: Numbers up to 1000

  ### Scoring
  - Base score: 100 points
  - Time bonus: Up to 100 points
  - Streak bonus: 10 points per streak
  - Perfect round: 50 bonus points

</details>

<details>
  <summary><strong> PvP Tic Tac Toe</strong></summary>

  **A classic two-player game with modern Discord integration.**

  ### How to Play
  - Challenge a friend with `/tictactoe start`
  - Take turns placing X or O
  - Try to get 3 in a row
  - Win by blocking your opponent's moves

  ### Commands
  ```
  /tictactoe start <opponent>
    Example: /tictactoe start @friend

  /tictactoe stats
    View your win/loss record
    Example: /tictactoe stats
  ```

  ### Features
  - Real-time multiplayer
  - Interactive board buttons
  - Turn timer (30 seconds)
  - Win/Draw detection
  - Move history tracking
  - Score tracking

  ### Winning Conditions
  - Get 3 in a row horizontally
  - Get 3 in a row vertically
  - Get 3 in a row diagonally
  - Block all opponent's moves (Draw)

</details>

<details>
  <summary><strong> Word Chain</strong></summary>

  **A continuous multiplayer word game where players take turns building word chains.**

  ### How to Play
  - The game starts automatically when someone types a valid word in the designated channel
  - Players take turns - no playing twice in a row
  - Each word must start with the last letter of the previous word
  - The game continues until someone enters an invalid word

  ### Commands
  - Type any word to start or continue the game
  - `/wordchain rules` - View game rules
  - `/wordchain stats` - View game statistics

  ### Rules
  1. Type any word to start the game
  2. Each word must start with the last letter of the previous word
  3. Minimum word length: 3 letters
  4. No repeating words
  5. No proper nouns or abbreviations
  6. Players take turns - no playing twice in a row
  7. Game continues until someone enters an invalid word
  8. Turn timeout: 30 seconds

  ### Game Settings
  - Admin-selected channel only
  - Anyone can participate at any time
  - Turn-based gameplay
  - No maximum players
  - No maximum rounds
  - Turn timeout: 30 seconds
  - Game ends when invalid word is entered

</details>

## Utility Commands

<details>
  <summary>Game Statistics</summary>

  View detailed game statistics:
  - `/stats` - Overall game statistics
  - `/stats user` - Personal statistics
  - `/stats server` - Server statistics
  - `/stats game <game>` - Specific game statistics

</details>

<details>
  <summary>Leaderboards</summary>

  View game leaderboards:
  - `/leaderboard` - Overall leaderboard
  - `/leaderboard <game>` - Game-specific leaderboard
  - `/leaderboard weekly` - Weekly rankings
  - `/leaderboard monthly` - Monthly rankings

</details>

<details>
  <summary>Game Settings</summary>

  Configure game preferences:
  - `/settings` - View current settings
  - `/settings set <key> <value>` - Change settings
  - `/settings reset` - Reset to defaults

</details>

## Game Development Structure

Each game follows a consistent structure:

```
src/games/<game-name>/
├── <GameName>Game.js      # Main game implementation
├── storyGenerator.js      # (Optional) Story generation
├── stats.js              # (Optional) Game statistics
└── index.js             # Export default game class
```

This structure provides:
- Clear separation of concerns
- Easy maintenance and updates
- Consistent implementation patterns
- Better organization for larger games

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/iiRedPanda/Milena.git
cd Milena

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Start the bot
npm start

# 5. Run in development mode (optional)
npm run dev
```

## License

MIT License - see LICENSE file for details.