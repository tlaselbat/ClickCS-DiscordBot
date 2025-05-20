/**
 * Module for managing voice channel roles in Discord.
 * @module eventloader
 */

const { GatewayIntentBits, Client } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

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

            if (oldState.channelId !== newState.channelId) {
                const action = newState.channel ? 'add' : 'remove';
                await newState.member.roles[action](role);
                logger.info(`Successfully ${action}ed "${ROLE_NAME}" role to ${newState.member.user.tag}`);
            }
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
        const eventFiles = await fs.readdir(path.join(__dirname, 'events'));
        const validFiles = eventFiles.filter(file => file.endsWith('.js'));

        for (const file of validFiles) {
            const event = require(path.join(__dirname, 'events', file));
            const eventName = path.parse(file).name;

            if (eventName === 'ready') {
                await event(client);
            } else {
                client.on(eventName, (...args) => event(...args, client));
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