const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { getConfig } = require('../config');
const { logger } = require('../utils/logger');

/**
 * Creates and configures a new Discord client instance
 * @returns {Promise<import('discord.js').Client>} Configured Discord client
 */
async function createDiscordClient() {
    const config = await getConfig();
    
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent
        ],
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction,
            Partials.User,
            Partials.GuildMember
        ],
        presence: {
            status: 'online',
            activities: [{
                name: 'Loading...',
                type: 0 // Playing
            }]
        },
        rest: {
            timeout: 30000,
            retries: 3,
            offset: 0
        }
    });

    // Attach config to client for easy access
    client.config = config;
    
    return client;
}

/**
 * Sets up event handlers for the Discord client
 * @param {import('discord.js').Client} client - The Discord client
 */
function setupClientEvents(client) {
    // Warning handler
    client.on('warn', (warning) => {
        logger.warn(`[DISCORD.JS] ${warning}`);
    });

    // Error handler
    client.on('error', (error) => {
        logger.error('Client error:', error);
    });

    // Ready event
    client.once('ready', async () => {
        if (!client.user || !client.application) {
            throw new Error('Client user or application not available');
        }
        logger.info(`Logged in as ${client.user.tag}`);
        logger.info(`Serving ${client.guilds.cache.size} guilds`);
        
        // Set initial presence
        await client.user.setPresence({
            activities: [{
                name: `${client.config.bot.prefix}help | ${client.guilds.cache.size} servers`,
                type: 0 // Playing
            }],
            status: 'online'
        });
    });
}

/**
 * Logs in the client with retry logic
 * @param {import('discord.js').Client} client - The Discord client
 * @param {string} token - The bot token
 * @param {number} [maxAttempts=5] - Maximum number of login attempts
 * @returns {Promise<void>}
 */
async function loginWithRetry(client, token, maxAttempts = 5) {
    let attempt = 1;
    const baseDelay = 1000;

    while (attempt <= maxAttempts) {
        try {
            await client.login(token);
            return;
        } catch (error) {
            if (attempt === maxAttempts) {
                throw error;
            }

            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.warn(`Login attempt ${attempt} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
}

// Export functions
module.exports = {
  createDiscordClient,
  setupClientEvents,
  loginWithRetry
};
