/**
 * Main entry point for the Discord bot
 * @module main
 */

const Discord = require('discord.js');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const config = require('./utils/config');
await config.load();
const prefix = config.get('bot.prefix');
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

/**
 * Main initialization function
 * @async
 */
async function initialize() {
    try {
        // Load environment variables
        dotenv.config();
        
        // Load event handlers
        require('./eventloader.js')(client);

        // Set up global error handlers
        setupErrorHandlers();

        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);
        logger.info('Bot successfully logged in');

    } catch (error) {
        logger.error('Initialization error:', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

/**
 * Sets up global error handlers
 */
function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection:', {
            reason: reason?.message || reason,
            promise: promise
        });
    });

    // Additional error handling
    process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down...');
        process.exit(0);
    });
}

// Start the bot
initialize();