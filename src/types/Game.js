/**
 * @typedef {Object} GameState
 * @property {string} status - Current game status (waiting, active, finished)
 * @property {Object} board - Current game board state
 * @property {Object[]} players - List of players in the game
 * @property {number} currentTurn - Index of the current player's turn
 * @property {Object} settings - Game-specific settings
 */

/**
 * @typedef {Object} GameData
 * @property {string} name - The name of the game
 * @property {string} description - Description of the game
 * @property {number} minPlayers - Minimum number of players required
 * @property {number} maxPlayers - Maximum number of players allowed
 * @property {Object} defaultSettings - Default game settings
 */

/**
 * @typedef {Object} Game
 * @property {GameData} data - Game metadata
 * @property {function} start - Function to start the game
 * @property {function} end - Function to end the game
 * @property {function} makeMove - Function to handle a player's move
 * @property {function} isValidMove - Function to validate a move
 * @property {function} getState - Function to get current game state
 */

export default {}; // Empty export to make this a module
