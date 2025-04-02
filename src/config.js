if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN is not defined in the environment variables. Please check your .env file.");
}

export const token = process.env.DISCORD_BOT_TOKEN; // Export the token from the .env file
