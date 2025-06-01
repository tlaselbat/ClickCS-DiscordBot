const { Events } = require('discord.js');
const voiceRoleManager = require('../services/voiceRoleManager');
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
    
    // Log current channel role mapping for debugging
    const guildConfig = await voiceRoleManager.getGuildConfig(member.guild.id);
    const channelRoleId = guildConfig?.channelRoles?.[channel.id];
    logger.debug(`[DEBUG] Channel ${channel.id} is mapped to role ID: ${channelRoleId || 'none'}`);
    
    // Log current config for debugging
    logger.debug('[DEBUG] VoiceRoleManager guild config:', {
      enabled: guildConfig?.enabled,
      channelRoles: guildConfig?.channelRoles || {}
    });
    
    // Check if voice roles are enabled for this guild
    if (!guildConfig?.enabled) {
      logger.debug(`[DEBUG] Voice roles are disabled for guild ${member.guild.id}`);
      return;
    }
    
    // Check if this channel has a role mapping
    if (!channelRoleId) {
      logger.debug(`[DEBUG] No role mapping found for channel ${channel.id} in guild ${member.guild.id}`);
      return;
    }
    
    try {
      // Add voice role to the member
      const success = await voiceRoleManager.addVoiceRole(member);
      
      if (success) {
        logger.info(`[SUCCESS] Added voice role to user ${member.user.tag} in guild ${member.guild.name}`);
        
        // Get the role for verification
        const role = await member.guild.roles.fetch(channelRoleId);
        if (!role) {
          logger.error(`[ERROR] Role ${channelRoleId} not found in guild ${member.guild.id}`);
          return;
        }
        
        // Log role assignment success
        logger.debug(`[DEBUG] Successfully assigned role ${role.name} (${role.id}) to ${member.user.tag}`);
      } else {
        logger.warn(`[WARNING] Failed to add voice role to user ${member.user.tag}`);
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
  const startTime = Date.now();
  const logContext = {
    userId: member?.id,
    userTag: member?.user?.tag,
    channelId: channel?.id,
    channelName: channel?.name,
    guildId: member?.guild?.id,
    guildName: member?.guild?.name,
    timestamp: new Date().toISOString()
  };

  try {
    if (!member || !channel) {
      logger.warn('[VOICE_LEAVE] Invalid member or channel provided', logContext);
      return;
    }
    
    const { guild, user } = member;
    logger.info(`[VOICE_LEAVE] User ${user.tag} (${user.id}) left voice channel ${channel.name} (${channel.id}) in guild ${guild.name} (${guild.id})`, logContext);
    
    // Log member's current roles for debugging
    const currentRoles = member.roles.cache.map(role => `${role.name} (${role.id})`);
    const currentRoleIds = member.roles.cache.map(role => role.id);
    
    logger.debug(`[DEBUG] User ${user.tag} current roles (${currentRoles.length}):`, {
      ...logContext,
      roles: currentRoles,
      roleCount: currentRoles.length
    });
    
    // Log bot's permissions
    const me = guild.members.me;
    if (me) {
      logger.debug(`[DEBUG] Bot permissions for role management:`, {
        ...logContext,
        canManageRoles: me.permissions.has('MANAGE_ROLES'),
        highestRole: me.roles.highest?.name,
        highestRolePosition: me.roles.highest?.position,
        botRoles: me.roles.cache.map(r => `${r.name} (${r.id})`)
      });
    }
    
    // Remove voice role from the member
    try {
      // Get the guild config
      const guildConfig = await voiceRoleManager.getGuildConfig(guild.id);
      
      logger.debug(`[DEBUG] Guild config for ${guild.id}:`, {
        ...logContext,
        enabled: guildConfig?.enabled,
        channelRoles: guildConfig?.channelRoles || {},
        roleCount: guildConfig?.channelRoles ? Object.keys(guildConfig.channelRoles).length : 0
      });
      
      // Get roles to be removed
      const rolesToRemove = guildConfig?.channelRoles ? Object.values(guildConfig.channelRoles) : [];
      const rolesToRemoveInfo = [];
      
      // Get role details for logging
      for (const roleId of rolesToRemove) {
        const role = guild.roles.cache.get(roleId);
        rolesToRemoveInfo.push({
          id: roleId,
          name: role?.name || 'Unknown Role',
          position: role?.position,
          managed: role?.managed,
          userHasRole: member.roles.cache.has(roleId)
        });
      }
      
      logger.info(`[ROLE] Attempting to remove ${rolesToRemoveInfo.filter(r => r.userHasRole).length} roles from ${user.tag}`, {
        ...logContext,
        rolesToRemove: rolesToRemoveInfo,
        rolesCount: rolesToRemoveInfo.length
      });
      
      // Call removeVoiceRole with detailed logging
      const removeStartTime = Date.now();
      logger.debug(`[DEBUG] Starting role removal process for ${user.tag}`, {
        ...logContext,
        timestamp: new Date().toISOString()
      });
      
      // Force fetch the latest member data before removal
      try {
        member = await guild.members.fetch({ user: user.id, force: true });
        logger.debug(`[DEBUG] Refreshed member data before role removal`, {
          ...logContext,
          currentRoles: member.roles.cache.map(r => `${r.name} (${r.id})`)
        });
      } catch (fetchError) {
        logger.error(`[ERROR] Failed to refresh member data before role removal:`, {
          ...logContext,
          error: fetchError.message,
          stack: fetchError.stack
        });
      }

      let rolesRemoved = false;
      try {
        rolesRemoved = await voiceRoleManager.removeVoiceRole(member);
      } catch (error) {
        logger.error(`[ERROR] Error during role removal:`, {
          ...logContext,
          error: error.message,
          stack: error.stack
        });
      }
      
      const removeTime = Date.now() - removeStartTime;
      logger.info(`[ROLE] Role removal process completed in ${removeTime}ms`, {
        ...logContext,
        success: rolesRemoved,
        durationMs: removeTime,
        rolesAfterRemoval: member.roles.cache.map(r => `${r.name} (${r.id})`)
      });
      
      if (rolesRemoved) {
        // Verify the roles were actually removed
        const verifyStartTime = Date.now();
        logger.debug(`[VERIFY] Verifying role removal for ${user.tag}`, {
          ...logContext,
          timestamp: new Date().toISOString()
        });
        
        const updatedMember = await guild.members.fetch({ user: user.id, force: true });
        const remainingRoles = [];
        
        for (const roleId of rolesToRemove) {
          if (updatedMember.roles.cache.has(roleId)) {
            const role = guild.roles.cache.get(roleId);
            remainingRoles.push({
              id: roleId,
              name: role?.name || 'Unknown Role',
              position: role?.position
            });
          }
        }
        
        const verifyTime = Date.now() - verifyStartTime;
        
        if (remainingRoles.length > 0) {
          logger.warn(`[VERIFY] Failed to verify removal of ${remainingRoles.length} roles for ${user.tag}`, {
            ...logContext,
            remainingRoles,
            durationMs: verifyTime,
            timestamp: new Date().toISOString()
          });
          
          // Try one more time with individual removal
          logger.info(`[RETRY] Attempting individual role removal for ${user.tag}`, {
            ...logContext,
            remainingRolesCount: remainingRoles.length
          });
          
          for (const { id: roleId, name } of remainingRoles) {
            const attemptStart = Date.now();
            try {
              logger.debug(`[RETRY] Attempting to remove role ${name} (${roleId}) from ${user.tag}`, {
                ...logContext,
                roleId,
                roleName: name,
                timestamp: new Date().toISOString()
              });
              
              await updatedMember.roles.remove(roleId, 'Force removal after failed verification');
              
              // Verify removal
              const refreshedMember = await guild.members.fetch({ user: user.id, force: true });
              const stillHasRole = refreshedMember.roles.cache.has(roleId);
              
              if (stillHasRole) {
                throw new Error(`Role still present after removal attempt`);
              }
              
              logger.info(`[SUCCESS] Force-removed role ${name} (${roleId}) from ${user.tag}`, {
                ...logContext,
                roleId,
                roleName: name,
                durationMs: Date.now() - attemptStart,
                timestamp: new Date().toISOString()
              });
              
            } catch (error) {
              logger.error(`[ERROR] Failed to force-remove role ${name} (${roleId}) from ${user.tag}`, {
                ...logContext,
                roleId,
                roleName: name,
                error: error.message,
                stack: error.stack,
                durationMs: Date.now() - attemptStart,
                timestamp: new Date().toISOString()
              });
            }
            
            // Rate limit protection
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          logger.info(`[SUCCESS] Verified removal of all roles from ${user.tag}`, {
            ...logContext,
            durationMs: verifyTime,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      logger.error(`[ERROR] Failed to remove roles from ${user.tag}`, {
        ...logContext,
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      // Re-throw to be caught by the outer try-catch
      throw error;
    }
    
    // Update presence or perform other actions
    await updateMemberPresence(member, 'left');
    
  } catch (error) {
    const errorContext = {
      ...logContext,
      error: error.message,
      stack: error.stack,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
    
    logger.error(`[ERROR] Failed to handle voice leave for user ${member?.user?.tag || 'unknown'}`, errorContext);
    
    // Log additional debug info
    try {
      if (member?.guild) {
        const botMember = member.guild.members.me;
        if (botMember) {
          logger.debug(`[DEBUG] Bot permissions at time of error:`, {
            ...errorContext,
            botPermissions: botMember.permissions.toArray(),
            botHighestRole: botMember.roles.highest?.name,
            botRoleCount: botMember.roles.cache.size
          });
        }
      }
    } catch (debugError) {
      logger.error(`[ERROR] Failed to gather debug info:`, debugError);
    }
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
