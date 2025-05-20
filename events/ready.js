/**
 * @file ready.js
 * Handles the Discord client ready event
 * @author Your Name
 * @version 1.0.0
 */

const { ActivityType } = require("discord.js");
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * Event handler for when the Discord client is ready
 * @async
 * @param {Client} client - The Discord.js client instance
 * @returns {Promise<void>}
 * @throws {Error} If presence setup fails
 */
module.exports = async (client) => {
    try {
        if (!client || !client.user || !client.guilds) {
            logger.warn('Client instance not fully initialized, skipping ready event');
            return;
        }

        // Wait for guilds to be fully cached
        await client.guilds.fetch().catch(() => {
            logger.warn('Failed to fetch guilds, continuing without presence update');
        });

        const guildCount = client.guilds.cache.size;
        const timestamp = new Date().toISOString();
        const botTag = client.user.tag;

        logger.info(`Bot ${botTag} is ready!`, {
            timestamp,
            guildCount,
            uptime: process.uptime()
        });

        // Update presence
        await client.user.setPresence({
            activities: [{
                name: `on ${guildCount} servers`,
                type: ActivityType.Watching
            }],
            status: 'online'
        }).catch(error => {
            logger.warn('Failed to update presence:', error);
        });

    } catch (error) {
        logger.error('Error in ready event:', {
            error: error.message,
            stack: error.stack
        });
        // Don't throw here, just log and continue
    }
};