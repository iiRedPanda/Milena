export const CONFIG = {
    COMMAND: {
        PREFIX: '!',
        COOLDOWN: 3000,
        MAX_ARGS: 10
    },
    ANALYTICS: {
        RETENTION_DAYS: 30,
        MAX_ERRORS_STORED: 1000,
        PERFORMANCE_SAMPLE_SIZE: 1000
    },
    CACHE: {
        DEFAULT_TTL: 3600000, // 1 hour
        MAX_SIZE: 1000,
        CLEANUP_INTERVAL: 300000 // 5 minutes
    },
    GAMES: {
        MAX_ACTIVE_GAMES: 5,
        MAX_PLAYERS_PER_GAME: 10,
        TURN_TIMEOUT: 60000, // 1 minute
        GAME_TIMEOUT: 1800000 // 30 minutes
    },
    MEMORY: {
        MAX_CONTEXT_LENGTH: 10,
        MAX_MEMORY_AGE: 86400000, // 24 hours
        PRUNE_INTERVAL: 3600000 // 1 hour
    },
    LOGGING: {
        MAX_FILE_SIZE: 10485760, // 10MB per file
        MAX_FILES: 10, // Keep 10 rotated files
        MAX_RETENTION: 2678400000, // 31 days in milliseconds
        CLEANUP_INTERVAL: 86400000 // Run cleanup daily
    },
    RESOURCES: {
        MAX_MEMORY_USAGE: 0.85, // 85%
        MAX_CPU_USAGE: 0.90, // 90%
        HEALTH_CHECK_INTERVAL: 60000 // 1 minute
    },
    SECURITY: {
        RATE_LIMIT: {
            MAX_REQUESTS: 60,
            TIME_WINDOW: 60000 // 1 minute
        },
        MAX_MESSAGE_LENGTH: 2000,
        ALLOWED_MENTIONS: {
            parse: ['users'],
            repliedUser: true
        }
    }
};
