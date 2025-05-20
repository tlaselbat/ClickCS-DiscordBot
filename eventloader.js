/**
 * Module for managing voice channel roles in Discord.
 * @module eventloader
 */

const { GatewayIntentBits, Client } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

// Cache for loaded events to prevent duplicate loading
const loadedEvents = new Map();

/**
 * Role name to manage for voice channel events
 * @constant {string}
 */
const ROLE_NAME = 'in vc';

/**
 * Sets up the voice state update event handler
 * @param {Client} client - Discord.js client instance
 * @throws {Error} If client is invalid
 */
async function setupVoiceStateUpdate(client) {
    if (!client || !client.on) {
        throw new Error('Invalid client instance');
    }

    client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            if (!newState.guild?.roles?.cache) {
                logger.warn('No guild roles cache found');
                return;
            }

            const role = newState.guild.roles.cache.find(r => 
                r.name.toLowerCase() === ROLE_NAME.toLowerCase()
            );

            if (!role) {
                logger.warn(`Role "${ROLE_NAME}" not found in guild roles`);
                return;
            }

            // Only process if user is in a voice channel
            if (!newState.channelId && !oldState.channelId) {
                return;
            }

            const action = newState.channel ? 'add' : 'remove';
            await newState.member.roles[action](role);
            logger.info(`Successfully ${action}ed "${ROLE_NAME}" role to ${newState.member.user.tag}`);
        } catch (error) {
            logger.error('Error in voiceStateUpdate:', {
                error: error.message,
                stack: error.stack,
                user: newState?.member?.user?.tag
            });
        }
    });
}

/**
 * Loads and registers all event handlers
 * @param {Client} client - Discord client instance
 * @throws {Error} If client is invalid
 */
module.exports = async (client) => {
    try {
        if (!client || !client.on) {
            throw new Error('Invalid client instance');
        }

        // Load voice state update handler
        await setupVoiceStateUpdate(client);

        // Load other event handlers
        const eventsDir = path.join(__dirname, 'events');
        const eventFiles = await fs.readdir(eventsDir);
        
        for (const file of eventFiles) {
            if (!file.endsWith('.js')) continue;
            
            const eventName = path.parse(file).name;
            
            // Skip if event is already loaded
            if (loadedEvents.has(eventName)) {
                logger.debug(`Skipping duplicate event: ${eventName}`);
                continue;
            }

            try {
                const event = require(path.join(eventsDir, file));
                loadedEvents.set(eventName, true);

                if (eventName === 'ready') {
                    await event(client);
                } else {
                    // For other events, pass client as the first parameter
                    client.on(eventName, (...args) => event(client, ...args));
                }
                
                logger.info(`Loaded event handler: ${eventName}`);
            } catch (error) {
                logger.error(`Failed to load event ${eventName}:`, {
                    error: error.message,
                    stack: error.stack
                });
                // Don't throw here to allow other events to load
            }
        }

        logger.info('All event handlers loaded successfully');
    } catch (error) {
        logger.error('Error loading event handlers:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};