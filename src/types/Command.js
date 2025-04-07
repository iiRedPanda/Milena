/**
 * @typedef {Object} CommandOption
 * @property {string} name - The name of the option
 * @property {string} description - Description of the option
 * @property {boolean} [required] - Whether the option is required
 * @property {string} [type] - The type of the option (string, number, boolean, user, channel, role)
 * @property {CommandOption[]} [options] - Sub-options for this option
 */

/**
 * @typedef {Object} CommandData
 * @property {string} name - The name of the command
 * @property {string} description - Description of what the command does
 * @property {string} [category] - The category this command belongs to
 * @property {string[]} [aliases] - Alternative names for the command
 * @property {boolean} [guildOnly] - Whether the command can only be used in a guild
 * @property {boolean} [ownerOnly] - Whether the command can only be used by the bot owner
 * @property {string[]} [permissions] - Required permissions to use this command
 * @property {number} [cooldown] - Cooldown in seconds between uses
 * @property {CommandOption[]} [options] - Command options/arguments
 */

/**
 * @typedef {Object} Command
 * @property {CommandData} data - Command metadata
 * @property {function} execute - Function to execute when command is called
 * @property {function} [autocomplete] - Function for autocomplete interactions
 * @property {function} [validate] - Function to validate command arguments
 */

export default {}; // Empty export to make this a module
