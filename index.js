require('dotenv').config();
const fs = require('fs').promises;
const { PermissionsBitField } = require('discord.js');
const client = require('./src/client');
const logger = require('./src/utils/logger');
const { CHANNEL_BEHAVIOR } = require('./src/constants');
const { saveMemory, saveConfigurations, initializeServerConfig } = require('./src/utils/configUtils');
const { isReplyToBot, getRepliedMessageContent } = require('./src/utils/messageUtils');

// Add constants for hardcoded strings
const STRINGS = {
    MEMORY_CLEARED: 'Memory for this channel has been cleared.',
    ADMIN_REQUIRED: 'You need to be an administrator or have an allowed admin role to use this command.',
    INVALID_COMMAND: 'Invalid setup command. Use `!setup allowChannel`, `!setup allowRole`, `!setup allowAdminRole`, or `!setup setErrorChannel`.',
    ERROR_NOTIFICATION: 'Error notifications will be sent to',
    HELP_MESSAGE: `
    **Milena Bot Commands:**
    - Mention the bot or reply to its messages to interact.
    - Use \`!clear\` to clear the memory for the current channel.
    - Use \`!help\` to display this help message.
    - Use \`!status\` to view bot status and configuration.
    `,
};

// Initialize Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Configure logger for debugging and error tracking
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add readable timestamps
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
            const stackString = stack ? `\nStack Trace:\n${stack}` : '';
            return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaString}${stackString}`;
        })
    ),
    transports: [
        new DailyRotateFile({
            filename: 'logs/bot-%DATE%.log', // Log file pattern
            datePattern: 'YYYY-MM-DD', // Rotate daily
            maxSize: '10m', // Maximum file size before rotation
            maxFiles: '14d', // Keep logs for 14 days
            level: 'info',
        }),
        new winston.transports.Console({
            level: 'info', // Show info and above in the terminal
            format: winston.format.combine(
                winston.format.colorize(), // Add colorization for console logs
                winston.format.printf(({ level, message, timestamp }) => {
                    return `[${timestamp}] [${level}]: ${message}`;
                })
            ),
            silent: (info) => {
                // Suppress specific log messages
                const suppressedMessages = [
                    "📨 Message received",
                    "🤖 Message from a bot",
                    "⏳ Sending request to Gemini API...",
                ];
                return suppressedMessages.some((msg) => info.message.includes(msg));
            },
        }),
    ],
});

// Configure separate loggers for each error type
const apiErrorLogger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
            const stackString = stack ? `\nStack Trace:\n${stack}` : '';
            return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaString}${stackString}`;
        })
    ),
    transports: [
        new DailyRotateFile({
            filename: 'logs/api-errors-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '5m',
            maxFiles: '30d',
        }),
    ],
});

const commandErrorLogger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
            const stackString = stack ? `\nStack Trace:\n${stack}` : '';
            return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaString}${stackString}`;
        })
    ),
    transports: [
        new DailyRotateFile({
            filename: 'logs/command-errors-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '5m',
            maxFiles: '30d',
        }),
    ],
});

const generalErrorLogger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
            const metaString = Object.keys(meta).length ? ` | Meta: ${JSON.stringify(meta)}` : '';
            const stackString = stack ? `\nStack Trace:\n${stack}` : '';
            return `[${timestamp}] [${level.toUpperCase()}]: ${message}${metaString}${stackString}`;
        })
    ),
    transports: [
        new DailyRotateFile({
            filename: 'logs/general-errors-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '5m',
            maxFiles: '30d',
        }),
    ],
});

// Update the logError function to use specific loggers
function logError(message, error, meta = {}, type = 'general') {
    const logMeta = { ...meta, stack: error.stack };

    switch (type) {
        case 'api':
            apiErrorLogger.error(message, logMeta);
            break;
        case 'command':
            commandErrorLogger.error(message, logMeta);
            break;
        case 'general':
        default:
            generalErrorLogger.error(message, logMeta);
            break;
    }
}

function logInfo(message, meta = {}) {
    logger.info(message, meta);
}

function logWarn(message, meta = {}) {
    logger.warn(message, meta);
}

// Add a helper function to notify about error logs in the terminal
function notifyErrorLocation() {
    console.log('[INFO]: Errors have been logged to the "logs/errors-<DATE>.log" file.');
}

let memory = {}; // In-memory storage for conversation history
let configurations = {}; // Store server-specific configurations
let saveMemoryTimeout = null;
let saveConfigTimeout = null; // Added missing variable

/**
 * Validate required environment variables.
 * @param {string[]} requiredVars - List of required environment variable names.
 */
function validateEnvVariables(requiredVars) {
    const missingVars = requiredVars.filter((key) => !process.env[key]);
    if (missingVars.length > 0) {
        logError(`ERROR: Missing required environment variables: ${missingVars.join(', ')}`, new Error('Missing environment variables')); // Fixed syntax error
        process.exit(1);
    }

    if (!process.env.GEMINI_API_URL || !/^https?:\/\/.+/.test(process.env.GEMINI_API_URL)) {
        logError('ERROR: Invalid or missing GEMINI_API_URL.', new Error('Invalid GEMINI_API_URL'));
        process.exit(1);
    }
}

// Validate only GEMINI_API_KEY and GEMINI_API_URL
validateEnvVariables(['DISCORD_BOT_TOKEN', 'GEMINI_API_KEY', 'GEMINI_API_URL']);

// Load memory and configurations from files asynchronously
(async () => {
    try {
        if (await fs.stat('./memory.json').catch(() => false)) {
            memory = JSON.parse(await fs.readFile('./memory.json', 'utf8'));
        }
        if (await fs.stat('./configurations.json').catch(() => false)) {
            configurations = JSON.parse(await fs.readFile('./configurations.json', 'utf8'));
        }
    } catch (error) {
        logError('Error loading memory or configurations', error);
        notifyErrorLocation(); // Notify about error log location
    }
})();

/**
 * Save data to a file with debounce.
 * @param {string} filePath - The file path to save data.
 * @param {object} data - The data to save.
 * @param {NodeJS.Timeout} timeoutVar - The debounce timeout variable.
 */
async function saveToFile(filePath, data, timeoutVar) {
    if (timeoutVar) clearTimeout(timeoutVar);
    timeoutVar = setTimeout(async () => {
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            logError(`Error saving to ${filePath}`, error);
            notifyErrorLocation(); // Notify about error log location
        }
    }, 5000);
}

// Replace saveMemory and saveConfigurations with saveToFile
async function saveMemory() {
    await saveToFile('./memory.json', memory, saveMemoryTimeout);
}

async function saveConfigurations() {
    await saveToFile('./configurations.json', configurations, saveConfigTimeout);
}

// Change memory pruning interval to 60 minutes
setInterval(async () => {
    await pruneOldMemory();
    await saveMemory();
}, 60 * 60 * 1000); // Every 60 minutes

/**
 * Fetch response from Gemini API.
 * @param {string} prompt - The prompt to send to the Gemini API.
 * @returns {Promise<string>} - The generated response from the Gemini API.
 */
async function fetchGeminiResponse(prompt) {
    const apiKey = process.env.GEMINI_API_KEY; // Load the API key
    const apiUrl = process.env.GEMINI_API_URL; // Load the API URL

    // Removed console.log statements to keep the console clear
    const input = {
        method: 'POST',
        url: apiUrl, // Use the URL from the .env file
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey, // Use the correct header for the API key
        },
        data: {
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        },
    };

    let retries = 3;
    let delayTime = 2000;

    while (retries > 0) {
        try {
            logInfo("⏳ Sending request to Gemini API...");
            const output = await axios.request(input);
            return output.data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't understand that.";
        } catch (error) {
            if (error.response && error.response.status === 429) {
                logWarn(`⚠️ Rate limited. Retrying in ${delayTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delayTime));
                retries--;
                delayTime *= 2;
            } else {
                logError("❌ Error during Gemini API request", error, { retriesLeft: retries }, 'api');
                throw error; // Avoid logging the same error again
            }
        }
    }
    throw new Error("❌ Failed to fetch response from Gemini API after multiple attempts.");
}

/**
 * Test the Gemini API to ensure it is working and verify the API key.
 */
async function testGeminiAPI() {
    try {
        const testPrompt = "Hello, this is a test prompt to check the Gemini API.";
        logInfo(`Testing Gemini API with URL: ${process.env.GEMINI_API_URL}`);
        logInfo(`Using API Key (partial): ...${process.env.GEMINI_API_KEY?.slice(-8)}`); // Show last 8 characters

        const response = await fetchGeminiResponse(testPrompt);

        if (response) {
            logInfo('✅ Gemini API test successful: Response received.');
        } else {
            throw new Error('No response text found in Gemini API test response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`❌ Gemini API Test Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('❌ Gemini API Test Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError('❌ Gemini API Test Error:', error, {}, 'api');
        }
        notifyErrorLocation();
    }
}

// Event triggered when the bot is ready
client.once('ready', async () => {
    const loadedApiKey = process.env.GEMINI_API_KEY;
    const isCorrectKey = loadedApiKey === process.env.GEMINI_API_KEY;

    // Fetch the guild name using the guild ID
    let guildName = "Unknown Guild";
    if (process.env.DISCORD_GUILD_ID) {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID).catch(() => null);
        if (guild) {
            guildName = guild.name;
        }
    }

    const startupMessage = `
    ============================================
    ✅ Milena Bot is up and running!
    ✅ Logged in as: ${client.user.tag}
    ✅ Guild ID: ${process.env.DISCORD_GUILD_ID}
    ✅ Guild Name: ${guildName}
    ${isCorrectKey ? '✅ Loaded the correct Gemini API key.' : '❌ Warning: Loaded an incorrect Gemini API key.'}
    ✅ Testing Gemini API with URL: ${process.env.GEMINI_API_URL}
    ✅ Using API Key (partial): ...${process.env.GEMINI_API_KEY?.slice(-8)}
    ============================================
    `;
    console.log(startupMessage); // Display the formatted startup message

    // Perform a test call to the Gemini API
    await testGeminiAPI();
});

// Define slash commands
const slashCommands = [
    {
        name: 'help',
        description: 'Display help information for Milena Bot.',
    },
    {
        name: 'clear',
        description: 'Clear the memory for the current channel.',
    },
    {
        name: 'status',
        description: 'View bot status and configuration.',
    },
    {
        name: 'setup',
        description: 'Configure bot settings.',
        options: [
            {
                name: 'subcommand',
                type: 3, // STRING
                description: 'The setup subcommand (e.g., allowChannel, allowRole, etc.)',
                required: true,
            },
            {
                name: 'mention',
                type: 3, // STRING
                description: 'The channel or role to configure.',
                required: false,
            },
            {
                name: 'channelBehavior',
                type: 1, // SUB_COMMAND
                description: 'Set the bot behavior for a specific channel.',
                options: [
                    {
                        name: 'channel',
                        type: 7, // CHANNEL
                        description: 'The channel to configure.',
                        required: true,
                    },
                    {
                        name: 'behavior',
                        type: 3, // STRING
                        description: 'The behavior mode (mentions, replies, all, disable).',
                        required: true,
                        choices: [
                            { name: 'Mentions Only', value: 'mentions' },
                            { name: 'Replies Only', value: 'replies' },
                            { name: 'All Messages', value: 'all' },
                            { name: 'Disable', value: 'disable' },
                        ],
                    },
                ],
            },
            {
                name: 'setSummarizeEmoji',
                type: 1, // SUB_COMMAND
                description: 'Set the emoji for triggering summarize.',
                options: [
                    {
                        name: 'emoji',
                        type: 3, // STRING
                        description: 'The emoji to use for triggering summarize.',
                        required: true,
                    },
                ],
            },
        ],
    },
    {
        name: 'config',
        description: 'View or update bot configurations.',
        options: [
            {
                name: 'key',
                type: 3, // STRING
                description: 'The configuration key to update.',
                required: false,
            },
            {
                name: 'value',
                type: 3, // STRING
                description: 'The new value for the configuration key.',
                required: false,
            },
        ],
    },
    {
        name: 'summarize',
        description: 'Summarize messages in the current channel.',
        options: [
            {
                name: 'start_message_id',
                type: 3, // STRING
                description: 'The ID of the starting message (optional).',
                required: false,
            },
            {
                name: 'end_message_id',
                type: 3, // STRING
                description: 'The ID of the ending message (optional).',
                required: false,
            },
        ],
    },
];

// Register slash commands as guild commands
(async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        logInfo('Started refreshing application (/) commands.');

        // Ensure DISCORD_GUILD_ID is defined
        if (!process.env.DISCORD_GUILD_ID) {
            throw new Error('DISCORD_GUILD_ID is not defined in the environment variables.');
        }

        // Register commands for a specific guild (server)
        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            { body: slashCommands }
        );

        logInfo('Successfully reloaded application (/) commands.');
    } catch (error) {
        logError('Error registering slash commands', error, {}, 'command');
        notifyErrorLocation(); // Notify about error log location
    }
})();

// Add command explanations for server settings
const commandExplanations = {
    help: 'Displays a list of available commands and their descriptions.',
    clear: 'Clears the memory for the current channel. Useful for resetting conversations.',
    status: 'Shows the bot\'s current status, uptime, and configuration details.',
    setup: 'Allows administrators to configure bot settings, such as allowed channels and roles.',
    config: 'Allows administrators to view or update bot configurations dynamically.',
    summarize: 'Summarizes messages in the current channel up to a specified message ID or using a reaction.',
};

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'help':
                await interaction.reply(STRINGS.HELP_MESSAGE);
                break;

            case 'clear':
                const hasAllowedRole = configurations[interaction.guildId]?.allowedRoles.some(roleId =>
                    interaction.member.roles.cache.has(roleId)
                );
                if (!hasAllowedRole) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                    return;
                }
                memory[interaction.channelId] = [];
                await saveMemory();
                await interaction.reply(STRINGS.MEMORY_CLEARED);
                break;

            case 'status':
                const uptime = process.uptime();
                const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
                const allowedChannels = configurations[interaction.guildId]?.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
                const allowedRoles = configurations[interaction.guildId]?.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
                const statusMessage = `
                **Milena Bot Status:**
                - Uptime: ${uptimeMessage}
                - Allowed Channels: ${allowedChannels}
                - Allowed Roles: ${allowedRoles}
                `;
                await interaction.reply(statusMessage);
                break;

            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
// Remove duplicate declarations of 'rateLimit'
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
// Ensure this is imported from './src/constants'

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {
                                interaction.reply('This channel is already allowed.');
                            }
                        },
                        allowRole: () => {
                            if (!config.allowedRoles.includes(id)) {
                                config.allowedRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This role is already allowed.');
                            }
                        },
                        allowAdminRole: () => {
                            if (!config.adminRoles.includes(id)) {
                                config.adminRoles.push(id);
                                saveConfigurations();
                                interaction.reply(`Admin role <@&${id}> has been allowed.`);
                            } else {
                                interaction.reply('This admin role is already allowed.');
                            }
                        },
                        setErrorChannel: () => {
                            config.errorNotificationChannel = id;
                            saveConfigurations();
                            interaction.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
                        },
                    };

                    actions[subCommand]();
                }
                break;

            case 'config':
                const key = options.getString('key');
                const value = options.getString('value');

                if (key && value) {
                    configurations[interaction.guildId][key] = value;
                    saveConfigurations();
                    await interaction.reply(`Configuration updated: ${key} = ${value}`);
                } else {
                    await interaction.reply(`Current configuration: ${JSON.stringify(configurations[interaction.guildId], null, 2)}`);
                }
                break;

            case 'summarize':
                const channelId = interaction.channelId;
                const startMessageId = options.getString('start_message_id');
                const endMessageId = options.getString('end_message_id');

                // Summarize messages
                const summary = await summarizeMessages(channelId, startMessageId, endMessageId);
                await interaction.reply(`Here is the summary:\n\n${summary}`);
                break;

            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logError('Error handling slash command', error, { commandName: interaction.commandName }, 'command');
        notifyErrorLocation(); // Notify about error log location
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
        }
    }
});

function initializeServerConfig(serverId) {
    configurations[serverId] = {
        allowedChannels: [],
        allowedRoles: [],
        adminRoles: [],
        errorNotificationChannel: null,
    };
    saveConfigurations();
    return configurations[serverId];
}

async function handleSetupCommand(message, config) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !config.adminRoles.some(roleId => message.member.roles.cache.has(roleId))) {
        message.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
        return;
    }

    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const mention = message.mentions.channels.first() || message.mentions.roles.first();

    if (!args[0] || !['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
        return;
    }

    if (!mention) {
        message.reply('Please mention a valid channel or role.');
        return;
    }

    const id = mention.id;

    const actions = {
        allowChannel: () => {
            if (!config.allowedChannels.includes(id)) {
                config.allowedChannels.push(id);
                saveConfigurations();
                message.reply(`Channel <#${id}> has been allowed.`);
            } else {
                message.reply('This channel is already allowed.');
            }
        },
        allowRole: () => {
            if (!config.allowedRoles.includes(id)) {
                config.allowedRoles.push(id);
                saveConfigurations();
                message.reply(`Role <@&${id}> has been allowed.`);
            } else {
                message.reply('This role is already allowed.');
            }
        },
        allowAdminRole: () => {
            if (!config.adminRoles.includes(id)) {
                config.adminRoles.push(id);
                saveConfigurations();
                message.reply(`Admin role <@&${id}> has been allowed.`);
            } else {
                message.reply('This admin role is already allowed.');
            }
        },
        setErrorChannel: () => {
            config.errorNotificationChannel = id;
            saveConfigurations();
            message.reply(`${STRINGS.ERROR_NOTIFICATION} <#${id}>.`);
        },
    };

    if (actions[subCommand]) {
        actions[subCommand]();
    } else {
        message.reply(STRINGS.INVALID_COMMAND);
    }
}

async function handleHelpCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    const helpMessage = STRINGS.HELP_MESSAGE;
    message.reply(helpMessage);
}

async function handleClearCommand(message, config) {
    const hasAllowedRole = config.allowedRoles.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
        message.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;
    }
    memory[message.channel.id] = [];
    saveMemory();
    message.reply(STRINGS.MEMORY_CLEARED);
}

async function handleStatusCommand(message, config) {
    const uptime = process.uptime();
    const uptimeMessage = `Bot has been running for ${Math.floor(uptime / 60)} minutes and ${Math.floor(uptime % 60)} seconds.`;
    const allowedChannels = config.allowedChannels.map(id => `<#${id}>`).join(', ') || 'None';
    const allowedRoles = config.allowedRoles.map(id => `<@&${id}>`).join(', ') || 'None';
    const statusMessage = `
    **Milena Bot Status:**
    - Uptime: ${uptimeMessage}
    - Allowed Channels: ${allowedChannels}
    - Allowed Roles: ${allowedRoles}
    `;
    message.reply(statusMessage);
}

/**
 * Make a request to the Gemini API with retry logic.
 * @param {string} context - The conversation context to send as a prompt.
 * @param {number} retries - Number of retries for the request./models/gemini-1.0-pro:generateContent"; // Read URL from .env
 * @returns {Promise<string>} - The generated response text.
 */
async function makeGeminiRequest(context, retries = 3) {
    const config = JSON.parse(await fs.readFile('./config.json', 'utf8')); // Ensure proper async usage
    const apiKey = process.env.GEMINI_API_KEY; // API key from env variable
    const apiUrl = process.env.GEMINI_API_URL; // Read URL from .env

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: context,
                    },
                ],
            },
        ],
        generationConfig: {
            maxOutputTokens: config.maxTokens,
            temperature: config.temperature,
        },
    };

    try {
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`, // Include the API key in the Authorization header
            },
        });

        if (response.data.candidates && response.data.candidates.length > 0) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('No response text found in Gemini API response.');
        }
    } catch (error) {
        if (error.response) {
            logError(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error, {}, 'api');
        } else if (error.request) {
            logError('Network Error: No response received from Gemini API.', error, {}, 'api');
        } else {
            logError(`Unexpected Error: ${error.message}`, error, {}, 'api');
        }
        notifyErrorLocation(); // Notify about error log location
        throw error;
    }
}

// Add graceful shutdown handling
process.on('SIGINT', async () => {
    logInfo('Shutting down gracefully...');
    await saveMemory();
    await saveConfigurations();
    console.log('Milena Bot has been shut down successfully.'); // Clear shutdown message
    process.exit(0);
});

// Add rate-limiting logic
const rateLimit = new Map();
function isRateLimited(userId) {
    const now = Date.now();
    const lastRequest = rateLimit.get(userId) || 0;
    if (now - lastRequest < 3000) {
        logWarn(`Rate limit triggered for user ${userId}`);
        return true; // 3-second cooldown
    }
    rateLimit.set(userId, now);
    return false;
}

// Add periodic cleanup for rate-limiting map
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of rateLimit.entries()) {
        if (now - timestamp > 3000) { // Clear entries older than 3 seconds
            rateLimit.delete(userId);
        }
    }
}, 10000); // Run cleanup every 10 seconds

// Add error notification channel logic
async function notifyErrorChannel(error, context) {
    const errorChannelId = configurations[context.serverId]?.errorNotificationChannel;
    if (errorChannelId) {
        const errorChannel = await client.channels.fetch(errorChannelId).catch(() => null);
        if (errorChannel) {
            errorChannel.send(`An error occurred: ${error.message}`);
        }
    }
}

// Log in to Discord with the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

async function pruneOldMemory() {
    try {
        const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
        const retentionPeriod = config.memoryRetentionMinutes * 60 * 1000; // Convert minutes to milliseconds
        const now = Date.now();

        for (const channelId in memory) {
            memory[channelId] = memory[channelId].filter(
                (entry) => now - entry.timestamp < retentionPeriod
            );
        }

        logInfo('Old memory entries pruned successfully.');
    } catch (error) {
        logError('Error pruning old memory entries', error);
        notifyErrorLocation(); // Notify about error log location
    }
}

// Check if the message is a reply to the bot
const isReplyToBot = async (msg) => {
    if (msg.reference) {
        const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
        return referencedMessage.author.id === client.user.id;
    }
    return false;
};

/**
 * Check if the message is a reply to the bot's message.
 * @param {Message} message - The incoming Discord message.
 * @returns {Promise<string|null>} - The content of the replied-to message if it was sent by the bot, otherwise null.
 */
const getRepliedMessageContent = async (message) => {
    if (message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                return repliedMessage.content; // Return the bot's replied message content
            }
        } catch {
            return null; // If the referenced message cannot be fetched, return null
        }
    }
    return null;
};

// Add constants for channel behavior modes
const CHANNEL_BEHAVIOR = {
    MENTIONS_ONLY: 'mentions_only',
    REPLIES_ONLY: 'replies_only',
    ALL_MESSAGES: 'all_messages',
    DISABLED: 'disabled',
};

// Default channel behavior configuration
if (!configurations.channelBehavior) configurations.channelBehavior = {};

/**
 * Handle the setup command for configuring channel behavior.
 * @param {Message} message - The incoming Discord message.
 * @param {Object} config - The server-specific configuration.
 */
async function handleSetupChannelBehavior(message, config) {
    const args = message.content.split(' ').slice(1);
    const subCommand = args[0];
    const channel = message.mentions.channels.first();

    if (!subCommand || !['mentions', 'replies', 'all', 'disable'].includes(subCommand)) {
        message.reply('Invalid subcommand. Use one of: mentions, replies, all, disable.');
        return;
    }

    if (!channel) {
        message.reply('Please mention a valid channel.');
        return;
    }

    const behaviorMap = {
        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
        disable: CHANNEL_BEHAVIOR.DISABLED,
    };

    configurations.channelBehavior[channel.id] = behaviorMap[subCommand];
    await saveConfigurations();

    message.reply(`Channel behavior for <#${channel.id}> has been set to "${subCommand}".`);
}

// Listen to all messages
client.on('messageCreate', async (message) => {
    // Suppress logging for bot messages
    if (message.author.bot) return;

    // Ignore messages containing @everyone
    if (message.mentions.everyone) return;

    logInfo(`📨 Message received: "${message.content}" | From: ${message.author.tag} | Channel: ${message.channel.id}`);

    // Get the channel behavior configuration
    const channelBehavior = configurations.channelBehavior[message.channel.id] || CHANNEL_BEHAVIOR.DISABLED;

    // Determine if the bot should reply based on the channel behavior
    const isMentioned = message.mentions.has(client.user);
    const repliedMessageContent = await getRepliedMessageContent(message);

    if (
        (channelBehavior === CHANNEL_BEHAVIOR.MENTIONS_ONLY && !isMentioned) ||
        (channelBehavior === CHANNEL_BEHAVIOR.REPLIES_ONLY && !repliedMessageContent) ||
        channelBehavior === CHANNEL_BEHAVIOR.DISABLED
    ) {
        return; // Do not reply if the behavior does not match
    }

    // Determine the context for the API prompt
    let context = '';
    if (repliedMessageContent) {
        context = `The user is replying to the bot's previous message: "${repliedMessageContent}".\n`;
    } else if (isMentioned) {
        context = 'The user has mentioned the bot in their message.\n';
    }

    // Add recent conversation history for better context
    const channelHistory = memory[message.channel.id] || [];
    const recentHistory = channelHistory
        .slice(-5) // Include the last 5 messages for context
        .map(entry => `${entry.author}: ${entry.content}`)
        .join('\n');

    // Prepare the final prompt for the API
    const prompt = `${context}Recent conversation history:\n${recentHistory}\nUser: ${message.content}\nAI:`;

    // Save the incoming message to memory
    if (!memory[message.channel.id]) memory[message.channel.id] = [];
    memory[message.channel.id].push({ author: message.author.username, content: message.content, timestamp: Date.now() });

    // Clean up old memory
    memory[message.channel.id] = memory[message.channel.id].filter(
        (entry) => Date.now() - entry.timestamp < 60 * 60 * 1000 // Retain messages from the last 60 minutes
    );

    // Save memory to file
    await saveMemory();

    // Typing indicator while processing
    await message.channel.sendTyping();

    try {
        // Send the prompt to the Gemini API
        const response = await fetchGeminiResponse(prompt);
        logInfo(`✅ Gemini Response: "${response}"`);

        // Reply to the user
        await message.reply(response);
    } catch (error) {
        logError("❌ Gemini API request failed:", error, {}, 'api');
        await message.reply("An error occurred while processing your request. Please try again later.");
    }
});

// Extend the setup command to include channel behavior configuration
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'setup':
                const subCommand = options.getString('subcommand');
                if (subCommand === 'channelBehavior') {
                    const channel = options.getChannel('channel');
                    const behavior = options.getString('behavior');

                    if (!['mentions', 'replies', 'all', 'disable'].includes(behavior)) {
                        await interaction.reply('Invalid behavior. Use one of: mentions, replies, all, disable.');
                        return;
                    }

                    const behaviorMap = {
                        mentions: CHANNEL_BEHAVIOR.MENTIONS_ONLY,
                        replies: CHANNEL_BEHAVIOR.REPLIES_ONLY,
                        all: CHANNEL_BEHAVIOR.ALL_MESSAGES,
                        disable: CHANNEL_BEHAVIOR.DISABLED,
                    };

                    configurations.channelBehavior[channel.id] = behaviorMap[behavior];
                    await saveConfigurations();

                    await interaction.reply(`Channel behavior for <#${channel.id}> has been set to "${behavior}".`);
                } else if (subCommand === 'setSummarizeEmoji') {
                    const emoji = options.getString('emoji');
                    configurations.summarizeEmoji = emoji;
                    await saveConfigurations();
                    await interaction.reply(`Summarize emoji has been set to "${emoji}".`);
                } else {
                    const mention = options.getString('mention');
                    const config = configurations[interaction.guildId] || initializeServerConfig(interaction.guildId);

                    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                        !config.adminRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
                        await interaction.reply({ content: STRINGS.ADMIN_REQUIRED, ephemeral: true });
                        return;
                    }

                    if (!['allowChannel', 'allowRole', 'allowAdminRole', 'setErrorChannel'].includes(subCommand)) {
                        await interaction.reply('Invalid subcommand. Use one of: allowChannel, allowRole, allowAdminRole, setErrorChannel.');
                        return;
                    }

                    if (!mention) {
                        await interaction.reply('Please mention a valid channel or role.');
                        return;
                    }

                    const id = mention.replace(/[<#@&>]/g, ''); // Extract ID from mention
                    const actions = {
                        allowChannel: () => {
                            if (!config.allowedChannels.includes(id)) {
                                config.allowedChannels.push(id);
                                saveConfigurations();
                                interaction.reply(`Channel <#${id}> has been allowed.`);
                            } else {