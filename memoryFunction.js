import { log, logError } from './botLogger.js'; // Import the centralized botLogger module

async function processMessage(message) {
    try {
        // Logic to save the message and use it for its intended purpose
        log('memory', 'Memory saved successfully.', { user: message.author.tag, content: message.content });
    } catch (error) {
        // Log errors related to memory saving in the respective log folder
        logError('memory', error, { user: message.author.tag, content: message.content });
    }
}

module.exports = { processMessage };
