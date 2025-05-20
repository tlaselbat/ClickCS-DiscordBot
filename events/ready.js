/**
 * @file ready.js
 * Handles the Discord client ready event
 * @author Your Name
 * @version 1.0.0
 */

const { ActivityType } = require("discord.js");
const logger = require('../utils/logger');

/**
 * Event handler for when the Discord client is ready
 * @async
 * @param {Client} client - The Discord.js client instance
 * @returns {Promise<void>}
 * @throws {Error} If presence setup fails
 */
module.exports = async (client) => {
    try {
        if (!client?.user) {
            throw new Error('Invalid client instance');
        }

        const guildCount = client.guilds.cache.size;
        const timestamp = new Date().toISOString();
        const botTag = client.user.tag;

        logger.info(`[${timestamp}] Client ready: ${botTag}`);
        logger.info(`[${timestamp}] Serving ${guildCount} servers`);

        // Set bot presence
        await Promise.all([
            client.user.setStatus('online'),
            client.user.setActivity(`in ${guildCount} servers`, { type: ActivityType.Watching })
        ]);

        logger.info('Bot presence set to ONLINE');
    } catch (error) {
        logger.error('Failed to set up bot presence:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};