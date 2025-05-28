/**
 * @file voiceStateUpdate.js
 * Handles Discord voice state updates to manage the 'vc_' role.
 * This module manages role assignment for users joining/leaving voice channels.
 */

import { Events } from 'discord.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom logger with timestamp formatting
 * @type {{info: Function, error: Function, debug: Function}}
 */
const log = {
    /**
     * Logs info messages with timestamp
     * @param {...any} args - Arguments to log
     */
    info: (...args) => console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
    /**
     * Logs error messages with timestamp and error stack
     * @param {string} message - Error message
     * @param {Error} [error] - Optional error object
     */
    error: (message, error) => console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, error?.stack || error),
    /**
     * Logs debug messages with timestamp
     * @param {...any} args - Arguments to log
     */
    debug: (...args) => console.log(`[${new Date().toISOString()}] [DEBUG]`, ...args)
};

/**
 * Cache to track user's voice channel state
 * @type {Map<string, string|null>}
 * @property {string} userId - User's Discord ID
 * @property {string|null} channelId - Voice channel ID or null if not in VC
 */
const voiceStateCache = new Map();

/**
 * Default role name for users in voice channels
 * @type {string}
 */
const ROLE_NAME = 'vc_';

/**
 * Checks if a user is blacklisted from VC role management
 * @param {GuildMember} member - The guild member to check
 * @param {Object} config - The guild's VC config
 * @returns {boolean} True if the user is blacklisted, false otherwise
 */
function isUserBlacklisted(member, config) {
    const blacklist = config.roles?.voiceChannel?.blacklist;
    
    // If blacklist is disabled, no one is blacklisted
    if (!blacklist?.enabled) {
        return false;
    }


    if (blacklist.adminBlacklisted ||
        (member.permissions.has('ADMINISTRATOR') ||
         config.permissions?.adminRoles?.some(r => member.roles.cache.has(r)))) {
        return true;
    }

    // Check if user is in the blacklist
    return blacklist.users?.includes(member.id) || false;
}

/**
 * Loads the bot configuration from JSON file
 * @returns {Promise<Object>} Parsed bot configuration
 * @throws {Error} If config file cannot be read
 */
async function loadBotConfig() {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'bot-config.json');
        const configData = await readFile(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        log.error('Failed to load bot config:', error);
        return { 
            roles: { 
                voiceChannel: { 
                    name: ROLE_NAME, 
                    enabled: true,
                    blacklist: {
                        enabled: true,
                        adminBlacklisted: true,
                        users: []
                    }
                } 
            } 
        };
    }
}

/**
 * Updates the voice state cache with user's current voice channel state
 * @param {string} userId - User's Discord ID
 * @param {string|null} channelId - Voice channel ID or null if user left VC
 */
function updateVoiceStateCache(userId, channelId) {
    if (channelId) {
        voiceStateCache.set(userId, channelId);
    } else {
        voiceStateCache.delete(userId);
    }
    log.debug('Voice state cache updated:', { userId, channelId });
}

/**
 * Main handler for Discord voice state updates
 * This function manages the 'vc_' role assignment based on user's voice channel state
 * @param {VoiceState} oldState - Previous voice state
 * @param {VoiceState} newState - New voice state
 * @returns {Promise<void>}
 */
export default async function handleVoiceStateUpdate(oldState, newState) {
    try {
        // Log the voice state change
        log.info('Voice state update:', {
            user: newState.member?.user.tag || oldState.member?.user.tag || 'Unknown User',
            userId: newState.id || oldState.id,
            oldChannel: oldState.channelId ? `#${oldState.channel?.name || 'unknown'}` : 'None',
            newChannel: newState.channelId ? `#${newState.channel?.name || 'unknown'}` : 'None',
            oldMute: oldState.mute,
            newMute: newState.mute,
            oldDeaf: oldState.deaf,
            newDeaf: newState.deaf
        });

        // Check if this is a mute/deafen event only (no channel change)
        if (oldState.channelId === newState.channelId && oldState.channelId !== null) {
            log.info('Skipping mute/deafen only event');
            return;
        }

        const guild = newState.guild || oldState.guild;
        if (!guild) {
            log.info('No guild found in voice state update');
            return;
        }

        // Get the member from the guild to ensure we have fresh data
        const memberId = newState.id || oldState.id;
        let member;
        try {
            member = await guild.members.fetch(memberId);
            if (!member) {
                log.info('No member found in voice state update');
                return;
            }
        } catch (error) {
            log.error('Failed to fetch member:', error);
            return;
        }
        
        // Get previous channel state from cache
        // This helps track if user was previously in a voice channel
        const previousChannelId = voiceStateCache.get(memberId);
        const currentChannelId = newState.channelId || oldState.channelId;
        
        // Update cache with current voice state
        // This ensures we maintain an accurate record of user's VC status
        if (newState.channelId) {
            updateVoiceStateCache(memberId, newState.channelId);
        } else if (oldState.channelId) {
            updateVoiceStateCache(memberId, null);
        }

        // Load bot config
        const botConfig = await loadBotConfig();
        const roleConfig = botConfig.roles?.voiceChannel;
        
        if (!roleConfig?.enabled) {
            log.info('Voice channel role management is disabled in config');
            return;
        }
        
        // Check if user is blacklisted
        if (isUserBlacklisted(member, botConfig)) {
            log.debug(`Skipping role management for blacklisted user: ${member.user.tag}`);
            return;
        }

        const roleName = roleConfig.name || ROLE_NAME;
        
        // Find the role by name (case insensitive)
        const role = guild.roles.cache.find(r => 
            r.name.toLowerCase() === roleName.toLowerCase()
        );

        if (!role) {
            log.info(`Role "${roleName}" not found in guild "${guild.name}"`);
            return;
        }

        // Determine if user joined or left a voice channel
        // Uses both current and cached states to ensure accurate detection
        // This helps handle edge cases where Discord's state updates might be delayed
        const joinedChannel = (!oldState.channelId && newState.channelId) || 
                            (!previousChannelId && newState.channelId);
        const leftChannel = (oldState.channelId && !newState.channelId) || 
                         (previousChannelId && !newState.channelId) ||
                         (oldState.channelId && newState.channelId === null);
                         
        log.debug('Voice state analysis:', {
            memberId: member.id,
            previousChannelId,
            oldChannelId: oldState.channelId,
            newChannelId: newState.channelId,
            joinedChannel,
            leftChannel
        });
        
        log.info('Channel change:', { 
            userId: member.id, 
            userTag: member.user.tag,
            joinedChannel, 
            leftChannel,
            oldChannel: oldState.channelId,
            newChannel: newState.channelId,
            oldState: {
                channelId: oldState.channelId,
                channel: oldState.channel?.name,
                mute: oldState.mute,
                deaf: oldState.deaf,
                streaming: oldState.streaming
            },
            newState: {
                channelId: newState.channelId,
                channel: newState.channel?.name,
                mute: newState.mute,
                deaf: newState.deaf,
                streaming: newState.streaming
            }
        });

        // Handle role assignment based on voice channel state
        if (joinedChannel) {
            // Add 'vc_' role when user joins a voice channel
            try {
                await member.roles.add(role, 'User joined voice channel');
                log.info(`✅ Added role "${role.name}" to ${member.user.tag} (${member.id})`);
            } catch (error) {
                log.error(`Failed to add role to ${member.user.tag}:`, error);
            }
        } else if (leftChannel) {
            // Remove 'vc_' role when user leaves a voice channel
            try {
                await member.roles.remove(role, 'User left voice channel');
                log.info(`✅ Removed role "${role.name}" from ${member.user.tag} (${member.id})`);
                
                // Verify role removal by fetching fresh member data
                const freshMember = await guild.members.fetch(member.id);
                if (freshMember.roles.cache.has(role.id)) {
                    log.error(`Role "${role.name}" still present after removal for ${member.user.tag}`);
                } else {
                    log.info(`Verified role "${role.name}" was removed from ${member.user.tag}`);
                }
            } catch (error) {
                log.error(`Failed to remove role from ${member.user.tag}:`, error);
            }
        }
    } catch (error) {
        log.error('Error in voiceStateUpdate:', error);
    }
}

// Export event name for registration
export const name = Events.VoiceStateUpdate;
