import performance from '../services/performance.js';
import logger from '../services/logger.js';

/**
 * Decorator function to track command performance and handle errors
 * @param {Function} commandFn - The command function to wrap
 * @returns {Function} - Wrapped command function with performance tracking
 */
export function trackCommandPerformance(commandFn) {
    return async function wrappedCommand(interaction, ...args) {
        const commandName = interaction.commandName;
        const startTime = Date.now();

        try {
            // Execute the command
            const result = await commandFn.call(this, interaction, ...args);

            // Track successful execution time
            const duration = Date.now() - startTime;
            performance.trackResponseTime('commands', duration);

            // Log performance data
            logger.log('debug', 'Command execution completed', {
                command: commandName,
                duration,
                success: true
            });

            return result;
        } catch (error) {
            // Track error
            performance.trackError('commands');

            // Log error with context
            logger.log('error', 'Command execution failed', {
                command: commandName,
                error: error.message,
                stack: error.stack,
                duration: Date.now() - startTime
            });

            // Re-throw the error for the global error handler
            throw error;
        }
    };
}

/**
 * Class decorator to add performance tracking to all command methods
 * @param {Class} CommandClass - The command class to enhance
 * @returns {Class} - Enhanced command class with performance tracking
 */
export function TrackPerformance(CommandClass) {
    // Get all method names from the class prototype
    const methodNames = Object.getOwnPropertyNames(CommandClass.prototype);

    // Wrap each method with performance tracking
    methodNames.forEach(methodName => {
        const method = CommandClass.prototype[methodName];
        if (methodName !== 'constructor' && typeof method === 'function') {
            CommandClass.prototype[methodName] = trackCommandPerformance(method);
        }
    });

    return CommandClass;
}

/**
 * Method decorator for tracking specific method performance
 * @param {Object} options - Configuration options for tracking
 * @returns {Function} - Decorator function
 */
export function TrackMethod(options = {}) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            const startTime = Date.now();
            const category = options.category || 'commands';

            try {
                const result = await originalMethod.apply(this, args);
                
                const duration = Date.now() - startTime;
                performance.trackResponseTime(category, duration);

                // Log detailed metrics if specified
                if (options.detailed) {
                    logger.log('debug', `${propertyKey} execution completed`, {
                        method: propertyKey,
                        category,
                        duration,
                        success: true,
                        ...options.metadata
                    });
                }

                return result;
            } catch (error) {
                performance.trackError(category);
                
                logger.log('error', `${propertyKey} execution failed`, {
                    method: propertyKey,
                    category,
                    error: error.message,
                    duration: Date.now() - startTime,
                    ...options.metadata
                });

                throw error;
            }
        };

        return descriptor;
    };
}
