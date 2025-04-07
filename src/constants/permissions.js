import { PermissionFlagsBits } from 'discord.js';

export const PERMISSIONS = {
    ADMIN: {
        name: 'Administrator',
        flag: PermissionFlagsBits.Administrator,
        description: 'Full access to all bot commands and features'
    },
    MODERATOR: {
        name: 'Moderator',
        flags: [
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.ManageMessages
        ],
        description: 'Access to moderation commands'
    },
    GAME_MASTER: {
        name: 'Game Master',
        flags: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles
        ],
        description: 'Access to game management commands'
    },
    USER: {
        name: 'User',
        flags: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ViewChannel
        ],
        description: 'Access to basic bot commands'
    }
};

export const COMMAND_PERMISSIONS = {
    // Admin commands
    CLEAR_MEMORY: [PERMISSIONS.ADMIN],
    MEMORY_PRUNE: [PERMISSIONS.ADMIN],
    CONFIG: [PERMISSIONS.ADMIN],
    MAINTENANCE: [PERMISSIONS.ADMIN],

    // Moderation commands
    CLEAR: [PERMISSIONS.MODERATOR, PERMISSIONS.ADMIN],
    KICK: [PERMISSIONS.MODERATOR, PERMISSIONS.ADMIN],
    BAN: [PERMISSIONS.MODERATOR, PERMISSIONS.ADMIN],
    MUTE: [PERMISSIONS.MODERATOR, PERMISSIONS.ADMIN],

    // Game commands
    GAME_START: [PERMISSIONS.GAME_MASTER, PERMISSIONS.ADMIN],
    GAME_STOP: [PERMISSIONS.GAME_MASTER, PERMISSIONS.ADMIN],
    GAME_RESET: [PERMISSIONS.GAME_MASTER, PERMISSIONS.ADMIN],

    // User commands
    HELP: [PERMISSIONS.USER],
    PING: [PERMISSIONS.USER],
    STATS: [PERMISSIONS.USER],
    PLAY: [PERMISSIONS.USER]
};
