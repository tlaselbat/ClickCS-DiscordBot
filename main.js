/**
 * Main entry point for the Discord bot
 * @module main
 */

const Discord = require('discord.js');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const config = require('./utils/config');
const VCConfig = require('./utils/vc-config');
const path = require('path');

/**
 * Discord client instance with configured intents
 * @type {Discord.Client}
 */
let client;

/**
 * Configuration interface
 * @typedef {Object} Config
 * @property {number[]} intents - Discord Gateway intents
 * @property {string[]} partials - Discord partial types
 */

/**
 * Initialize the Discord client with proper configuration
 * @returns {Discord.Client}
 */
function createClient() {
    const intents = [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildVoiceStates,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.DirectMessages,
        Discord.GatewayIntentBits.GuildMembers
    ];

    const clientConfig = {
        intents: intents,
        partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
        rest: {
            rateLimit: {
                timeout: 1000,
                maxRetries: 3,
                retryDelay: 1000
            }
        }
    };

    const newClient = new Discord.Client(clientConfig);
    newClient.config = new VCConfig(path.join(__dirname, 'config'));
    return newClient;
}

/**
 * Main initialization function
 * @async
 * @throws {Error} If initialization fails
 */
async function initialize() {
    try {
        // Load configuration
        await config.load();
        
        // Load environment variables
        dotenv.config();
        validateEnvironment();
        
        // Initialize Discord client
        client = createClient();
        
        // Load event handlers
        require('./eventloader.js')(client);

        // Set up global error handlers
        setupErrorHandlers();

        // Login to Discord with retry logic
        await loginWithRetry(client, process.env.DISCORD_TOKEN);
        
        // Wait for client to be fully initialized
        await new Promise((resolve) => {
            if (client.user) {
                resolve();
            } else {
                client.once('ready', resolve);
            }
        });

        logger.info('Bot successfully logged in');

    } catch (error) {
        logger.error('Initialization error:', {
            error: error.message,
            stack: error.stack
        });
        // Clean up client if it exists
        if (client) {
            await client.destroy().catch(() => {});
        }
        process.exit(1);
    }
}

/**
 * Validates required environment variables
 * @throws {Error} If required environment variables are missing
 */
function validateEnvironment() {
    const requiredEnvVars = ['DISCORD_TOKEN'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
}

/**
 * Attempts to login with exponential backoff
 * @param {Discord.Client} client - Discord client instance
 * @param {string} token - Discord bot token
 * @returns {Promise<void>}
 */
async function loginWithRetry(client, token, maxAttempts = 3) {
    let attempts = 0;
    const baseDelay = 1000;

    while (attempts < maxAttempts) {
        try {
            // Only destroy if we have a valid client instance
            if (client && client.destroy && client.user) {
                await client.destroy();
            }
            
            // Create new client instance if needed
            if (!client || !client.user) {
                client = createClient();
                require('./eventloader.js')(client);
                setupErrorHandlers();
            }
            
            // Login
            await client.login(token);
            
            // Wait for client to be fully initialized
            await new Promise((resolve) => {
                if (client.user) {
                    resolve();
                } else {
                    client.once('ready', resolve);
                }
            });

            return;
        } catch (error) {
            attempts++;
            if (attempts === maxAttempts) {
                throw error;
            }
            
            const delay = baseDelay * Math.pow(2, attempts);
            logger.warn(`Login attempt ${attempts} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Sets up global error handlers for the process
 */
function setupErrorHandlers() {
    // Error handling for uncaught exceptions
    process.on('uncaughtException', (error) => {
        const errorDetails = formatError(error);
        logger.error('Uncaught Exception:', errorDetails);
        
        // Attempt to recover gracefully
        if (client) {
            logger.warn('Attempting to reconnect...');
            handleReconnection(error);
        } else {
            process.exit(1);
        }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        const errorDetails = formatError(reason);
        logger.error('Unhandled Rejection:', errorDetails);
        
        // Attempt to recover if possible
        if (reason?.name === 'DiscordAPIError' && client) {
            logger.warn('Discord API error detected, attempting to reconnect...', errorDetails);
            handleReconnection(reason);
        }
    });

    // Graceful shutdown handlers
    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
            shutdown(signal)
                .catch(error => {
                    logger.error('Error during shutdown:', error);
                    process.exit(1);
                });
        });
    });
}

/**
 * Formats an error object for logging
 * @param {Error} error - The error to format
 * @returns {Object} Formatted error details
 */
function formatError(error) {
    return {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        name: error?.name || 'UnknownError',
        code: error?.code,
        cause: error?.cause?.message,
        timestamp: new Date().toISOString()
    };
}

/**
 * Handles reconnection attempts
 * @param {Error} error - The error that triggered reconnection
 */
async function handleReconnection(error) {
    try {
        // Only destroy if we have a valid client instance
        if (client && client.destroy && client.user) {
            await client.destroy();
        }
        
        // Create new client instance
        client = createClient();
        
        // Re-load event handlers
        require('./eventloader.js')(client);
        
        // Re-setup error handlers
        setupErrorHandlers();
        
        // Re-login
        await loginWithRetry(client, process.env.DISCORD_TOKEN);
        logger.info('Successfully reconnected after error');
    } catch (reconnectError) {
        logger.error('Failed to reconnect:', formatError(reconnectError));
        // Clean up client if it exists
        if (client && client.destroy) {
            await client.destroy().catch(() => {});
        }
        process.exit(1);
    }
}

/**
 * Gracefully shut down the bot
 * @param {string} signal - The signal that triggered the shutdown
 */
async function shutdown(signal) {
    try {
        logger.info(`Received shutdown signal: ${signal}`);
        
        // Clean up resources
        if (client) {
            await client.destroy();
            client = null;
        }
        
        // Wait for any pending operations
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        logger.info('Bot shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', formatError(error));
        process.exit(1);
    }
}

// Start the bot
initialize();