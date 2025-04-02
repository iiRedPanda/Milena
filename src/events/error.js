import logger from '../logger.js'; // Replace require with import

export default {
    name: 'error', // Ensure the name is defined
    execute(error) {
        // Log the error with additional context
        logger.error(`Discord.js error: ${error.message}`, {
            name: error.name,
            stack: error.stack,
            code: error.code,
        });

        // Handle specific types of errors if needed
        if (error.code === 'ECONNRESET') {
            logger.warn('Connection reset by peer.');
        } else if (error.code === 'ETIMEDOUT') {
            logger.warn('Connection timed out.');
        } else {
            logger.error('An unexpected error occurred.');
        }
    }
};