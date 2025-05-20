/**
 * Voice state update event handler
 * @module events/voiceStateUpdate
 */

const { GuildMember, VoiceState, Permissions } = require('discord.js');
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
async function handleVoiceStateUpdate(oldState, newState, client) {
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
        
        // Handle channel access and role assignment
        try {
            const config = await client.config.getVCConfig(guild.id);
            
            // Handle channel access
            if (config.channelAccessEnabled && config.channelId) {
                const channel = guild.channels.cache.get(config.channelId);
                if (channel) {
                    const permissions = channel.permissionsFor(member);
                    
                    if (newState.channelId && !permissions.has(Permissions.FLAGS.VIEW_CHANNEL)) {
                        await channel.permissionOverwrites.edit(member, {
                            VIEW_CHANNEL: true
                        });
                    } else if (!newState.channelId && permissions.has(Permissions.FLAGS.VIEW_CHANNEL)) {
                        await channel.permissionOverwrites.edit(member, {
                            VIEW_CHANNEL: false
                        });
                    }
                }
            }

            // Handle role assignment
            if (config.roleAssignmentEnabled && config.roleId) {
                const role = guild.roles.cache.get(config.roleId);
                if (role) {
                    if (newState.channelId && !member.roles.cache.has(role.id)) {
                        await member.roles.add(role);
                    } else if (!newState.channelId && member.roles.cache.has(role.id)) {
                        await member.roles.remove(role);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling voice state update:', error);
        }
    } catch (error) {
        logger.error('Error in voiceStateUpdate event handler:', {
            error: error.message,
            stack: error.stack,
            guild: newState?.guild?.id,
            user: newState?.member?.user?.tag
        });
        throw error; // Let the event loader handle the error
    }
}

module.exports = handleVoiceStateUpdate;
