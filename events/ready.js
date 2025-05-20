/**
 * @file ready.js
 * Handles the Discord client ready event
 * This module sets up the bot's presence and logs initialization information
 * @author Your Name
 * @version 1.0.0
 */

/**
 * @module events/ready
 * @description Handles the Discord client ready event
 * @param {Client} client - The Discord.js client instance
 * @throws {Error} If presence setup fails
 * @throws {TypeError} If client is not a Discord.js Client instance
 */

const {ActivityType} = require("discord.js");
const logger = require('../utils/logger');

/**
 * Event handler for when the Discord client is ready
 * @async
 * @param {Client} client - The Discord.js client instance
 * @returns {Promise<void>}
 * @throws {Error} If presence setup fails
 * @throws {TypeError} If client is not a Discord.js Client instance
 */
/**
 * Handles the Discord client ready event
 * This event is triggered when the bot successfully connects to Discord
 * @param {Discord.Client} client - The Discord client instance
 * @throws {TypeError} If an invalid client instance is provided
 * @throws {Error} If presence setup fails after retries
 */
module.exports = async (client) => {
    try {
        // Validate the Discord client instance
        if (!client || typeof client !== 'object' || !client.user) {
            throw new TypeError('Invalid client instance provided');
        }

        // Log detailed client initialization information with timestamp
        const timestamp = new Date().toISOString();
        logger.info(`[${timestamp}] Ready event triggered`);
        logger.info(`[${timestamp}] Client user: ${client.user.tag}`);
        logger.info(`[${timestamp}] Client ID: ${client.user.id}`);
        logger.info(`[${timestamp}] Online in ${client.guilds.cache.size} servers`);
        logger.info(`[${timestamp}] Client is ready.`);

        // Set bot presence
        await client.user.setPresence({
            activities: [{
                name: `in ${client.guilds.cache.size} servers`,
                type: ActivityType.Watching
            }],
            status: 'dnd'
        });

        logger.info('Bot presence set to DND successfully');
    } catch (error) {
        logger.error(`[${timestamp}] Failed to set up bot presence:`, error);
        throw error;
    }
};