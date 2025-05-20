/**
 * Voice state update event handler
 * @module events/voiceStateUpdate
 */

const { GuildMember, VoiceState } = require('discord.js');
const logger = require('../utils/logger');

/**
 * Role name to manage for voice channel events
 * @constant {string}
 */
const ROLE_NAME = 'in vc';

/**
 * Handles voice state updates for managing "in vc" role
 * @param {VoiceState} oldState - The old voice state
 * @param {VoiceState} newState - The new voice state
 * @param {Client} client - The Discord client instance
 * @throws {Error} If role management fails
 */
module.exports = async (oldState, newState, client) => {
    try {
        // Early return if no state change
        if (oldState.channelId === newState.channelId) {
            return;
        }

        const { guild, member } = newState;
        
        if (!guild || !member) {
            logger.warn('Invalid voice state update parameters');
            return;
        }

        // Find the role
        const role = guild.roles.cache.find(r => 
            r.name.toLowerCase() === ROLE_NAME.toLowerCase()
        );

        if (!role) {
            logger.warn(`Role "${ROLE_NAME}" not found in guild ${guild.id}`);
            return;
        }

        // Determine action based on channel state
        const action = newState.channel ? 'add' : 'remove';
        
        // Update role
        await member.roles[action](role);
        
        logger.info(`Successfully ${action}ed "${ROLE_NAME}" role to ${member.user.tag} in ${guild.name}`);
        
    } catch (error) {
        logger.error('Error in voiceStateUpdate event handler:', {
            error: error.message,
            stack: error.stack,
            guild: newState?.guild?.id,
            user: newState?.member?.user?.tag
        });
        throw error; // Let the event loader handle the error
    }
};
