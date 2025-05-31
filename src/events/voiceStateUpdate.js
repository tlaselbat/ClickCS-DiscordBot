const { Events } = require('discord.js');
const { voiceRoleManager } = require('../services/voiceRoleManager');
const logger = require('../utils/logger');

/**
 * Handles voice state update events
 * @param {import('discord.js').VoiceState} oldState - The voice state before the update
 * @param {import('discord.js').VoiceState} newState - The voice state after the update
 * @returns {Promise<void>}
 */
async function handleVoiceStateUpdate(oldState, newState) {
  try {
    logger.debug('[VOICE_STATE_UPDATE] Received voice state update');
    
    const { member, guild } = newState;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Log the voice state update for debugging
    logger.debug('[VOICE_STATE_UPDATE] Voice state update:', {
      userId: member?.id || 'unknown',
      userTag: member?.user?.tag || 'unknown',
      oldChannel: oldChannel?.name || 'none',
      oldChannelId: oldChannel?.id || 'none',
      newChannel: newChannel?.name || 'none',
      newChannelId: newChannel?.id || 'none',
      guildId: guild?.id || 'unknown',
      guildName: guild?.name || 'unknown',
      memberType: member ? 'valid' : 'invalid',
      isBot: member?.user?.bot ? 'yes' : 'no',
      guildAvailable: guild?.available ? 'yes' : 'no'
    });

    // Ignore if member is a bot, guild is unavailable, or member is null
    if (!member) {
      logger.debug('[VOICE_STATE_UPDATE] Ignoring update: No member object');
      return;
    }
    
    if (member.user?.bot) {
      logger.debug('[VOICE_STATE_UPDATE] Ignoring update: Member is a bot');
      return;
    }
    
    if (!guild.available) {
      logger.debug('[VOICE_STATE_UPDATE] Ignoring update: Guild not available');
      return;
    }

    // Check if user joined a voice channel
    if (!oldChannel && newChannel) {
      logger.debug(`User ${member.id} joined voice channel ${newChannel.id}`);
      await handleVoiceJoin(member, newChannel);
    }
    // Check if user left a voice channel
    else if (oldChannel && !newChannel) {
      logger.debug(`User ${member.id} left voice channel ${oldChannel.id}`);
      await handleVoiceLeave(member, oldChannel);
    }
    // Check if user switched voice channels
    else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      logger.debug(`User ${member.id} switched from ${oldChannel.id} to ${newChannel.id}`);
      await handleVoiceSwitch(member, oldChannel, newChannel);
    }
    // Check if user was server muted/deafened
    else if (oldState.serverMute !== newState.serverMute || 
             oldState.serverDeaf !== newState.serverDeaf) {
      logger.debug(`User ${member.id} was server muted/deafened in guild ${guild.id}`);
    }
  } catch (error) {
    logger.error('Error in voiceStateUpdate handler', error);
  }
}

/**
 * Handle user joining a voice channel
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {import('discord.js').VoiceChannel} channel - The voice channel
 * @returns {Promise<void>}
 */
async function handleVoiceJoin(member, channel) {
  try {
    logger.info(`[VOICE] User ${member.user.tag} (${member.id}) joining channel ${channel.name} (${channel.id})`);
    
    // Log member's current roles for debugging
    const currentRoles = member.roles.cache.map(role => `${role.name} (${role.id})`).join(', ');
    logger.debug(`[DEBUG] User ${member.user.tag} current roles: ${currentRoles}`);
    
    // Check if bot has permissions
    logger.debug(`[DEBUG] Getting bot member object`);
    const me = member.guild.members.me;
    if (!me) {
      logger.error('[ERROR] Bot member not found in guild');
      return false;
    }
    
    logger.debug(`[DEBUG] Bot member found: ${me.user.tag} (${me.id})`);
    
    // Log bot's permissions
    const botPermissions = me.permissions.toArray();
    logger.debug(`[DEBUG] Bot permissions: ${botPermissions.join(', ')}`);
    
    const hasManageRoles = me.permissions.has('ManageRoles');
    logger.debug(`[DEBUG] Bot has ManageRoles permission: ${hasManageRoles}`);
    
    if (!hasManageRoles) {
      logger.error('[ERROR] Bot is missing ManageRoles permission');
      return false;
    }
    
    // Check if the bot is in the same guild as the member
    if (member.guild.id !== me.guild.id) {
      logger.warn(`[WARN] Bot is not in the same guild as the member`);
      return false;
    }
    
    // Log channel permissions
    const channelPerms = channel.permissionsFor(me);
    const missingChannelPerms = ['ViewChannel', 'Connect', 'Speak', 'ManageRoles']
      .filter(perm => !channelPerms.has(perm));
    
    if (missingChannelPerms.length > 0) {
      logger.error(`[ERROR] Bot is missing channel permissions: ${missingChannelPerms.join(', ')}`);
      return false;
    }
    
    logger.debug(`[DEBUG] Bot has all required channel permissions`);
    
    // Ensure voiceRoleManager is initialized
    if (!voiceRoleManager.initialized) {
      logger.debug('[DEBUG] VoiceRoleManager not initialized, initializing...');
      await voiceRoleManager.initialize();
    }

    // Add voice role to the member
    logger.debug(`[DEBUG] Attempting to add voice role to user ${member.user.tag} in channel ${channel.id}`);
    try {
      // Log the current channel role mapping for debugging
      const channelRoleId = voiceRoleManager.config?.channelRoles?.[channel.id];
      logger.debug(`[DEBUG] Channel ${channel.id} is mapped to role ID: ${channelRoleId || 'none'}`);
      
      // Log current config for debugging
      logger.debug('[DEBUG] VoiceRoleManager config:', {
        enabled: voiceRoleManager.config?.enabled,
        channelRoles: voiceRoleManager.config?.channelRoles || {}
      });
      
      const success = await voiceRoleManager.addVoiceRole(member);
      
      if (success) {
        logger.info(`[SUCCESS] Added voice role to user ${member.user.tag} in guild ${member.guild.name}`);
        
        // Verify the role was added
        await member.fetch(true); // Refresh member data
        const roleId = voiceRoleManager.config?.channelRoles?.[channel.id];
        const hasRole = roleId ? member.roles.cache.has(roleId) : false;
        
        // Log all roles the member has for debugging
        const memberRoles = member.roles.cache.map(r => `${r.name} (${r.id})`).join(', ');
        logger.debug(`[DEBUG] Member ${member.user.tag} roles after assignment: ${memberRoles}`);
        logger.debug(`[DEBUG] Verified role assignment: ${hasRole} for role ID: ${roleId || 'none'}`);
        
        if (!hasRole) {
          logger.warn(`[WARNING] Role assignment verification failed for user ${member.user.tag}. Expected role ID: ${roleId}`);
        }
      } else {
        logger.warn(`[WARNING] Failed to add voice role to user ${member.user.tag}`);
        
        // Log additional debug info
        logger.debug(`[DEBUG] Voice role manager config:`, {
          enabled: voiceRoleManager.config?.enabled,
          channelRoles: voiceRoleManager.config?.channelRoles ? Object.entries(voiceRoleManager.config.channelRoles).map(([cId, rId]) => ({
            channelId: cId,
            roleId: rId
          })) : 'none'
        });
      }
    } catch (error) {
      logger.error(`[ERROR] Exception in voiceRoleManager.addVoiceRole:`, {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      return false;
    }
    
    // Update presence or perform other actions
    await updateMemberPresence(member, 'joined');
    
  } catch (error) {
    logger.error(`Failed to handle voice join for user ${member.id}`, error);
    
    // Log additional context for debugging
    logger.error('Voice join error context:', {
      userId: member.id,
      guildId: member.guild.id,
      channelId: channel.id,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack
      }
    });
  }
}

/**
 * Handle user leaving a voice channel
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {import('discord.js').VoiceChannel} channel - The voice channel
 * @returns {Promise<void>}
 */
async function handleVoiceLeave(member, channel) {
  try {
    logger.debug(`User ${member.id} left voice channel ${channel.id} in guild ${member.guild.id}`);
    
    // Remove voice role from the member
    await voiceRoleManager.removeVoiceRole(member);
    
    // Update presence or perform other actions
    await updateMemberPresence(member, 'left');
  } catch (error) {
    logger.error(`Failed to handle voice leave for user ${member.id}`, error);
  }
}

/**
 * Handle user switching voice channels
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {import('discord.js').VoiceChannel} oldChannel - The old voice channel
 * @param {import('discord.js').VoiceChannel} newChannel - The new voice channel
 * @returns {Promise<void>}
 */
async function handleVoiceSwitch(member, oldChannel, newChannel) {
  try {
    logger.debug(
      `User ${member.id} switched from voice channel ${oldChannel.id} to ${newChannel.id} in guild ${member.guild.id}`
    );
    
    // The role will be maintained since the user is still in a voice channel
    // But we can update any channel-specific settings or presence here
    await updateMemberPresence(member, 'moved');
  } catch (error) {
    logger.error(`Failed to handle voice switch for user ${member.id}`, error);
  }
}

/**
 * Update member presence or perform other actions
 * @param {import('discord.js').GuildMember} member - The guild member
 * @param {'joined' | 'left' | 'moved'} action - The action that triggered the update
 * @returns {Promise<void>}
 */
async function updateMemberPresence(member, action) {
  try {
    // This is a placeholder for any presence or activity updates
    // You can implement custom presence logic here based on the action
    const actions = {
      joined: 'joined a voice channel',
      left: 'left a voice channel',
      moved: 'moved to another voice channel'
    };
    
    logger.debug(`User ${member.id} ${actions[action]}`);
  } catch (error) {
    logger.error(`Failed to update presence for user ${member.id}`, error);
  }
}

// Export the event name and handler
module.exports = {
  name: Events.VoiceStateUpdate,
  execute: handleVoiceStateUpdate
};
