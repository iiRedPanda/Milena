/**
 * @typedef {Object} EventData
 * @property {string} name - The name of the event
 * @property {string} description - Description of what the event handles
 * @property {boolean} [once] - Whether to only listen to this event once
 * @property {boolean} [enabled] - Whether this event is enabled
 */

/**
 * @typedef {Object} Event
 * @property {EventData} data - Event metadata
 * @property {function} execute - Function to execute when event is triggered
 */

export default {}; // Empty export to make this a module
