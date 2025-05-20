const Discord = require("discord.js");
const winston = require('winston');
const dotenv = require('dotenv');
dotenv.config();
const logger = require('./utils/logger');

/**
 * Create a new Discord client instance with specific intents
 * @type {Discord.Client}
 */
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildVoiceStates,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.DirectMessages
    ]
});

// Load event handlers for the bot
require(`./eventloader.js`)(client);

// Global error handler
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', { reason, promise });
});

// Login to Discord using environment variable
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        logger.info('Bot successfully logged in');
    })
    .catch((error) => {
        logger.error('Failed to login:', error);
        process.exit(1);
    });