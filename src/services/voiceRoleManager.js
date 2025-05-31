const { Collection } = require('discord.js');
const { getConfig } = require('../config');
const logger = require('../utils/logger');
const { DatabaseError, NotFoundError } = require('../utils/errorHandler');

// In-memory cache for voice role state
const voiceStateCache = new Collection();

class VoiceRoleManager {
  constructor() {
    this.guildConfigs = new Map();
    this.initialized = true; // Mark as initialized since we'll load configs on demand
    logger.info('VoiceRoleManager initialized');
  }

  /**
   * Get or load configuration for a specific guild
   * @param {string} guildId - The guild ID to get config for
   * @returns {Promise<Object>} The guild's configuration
   */
  async getGuildConfig(guildId) {
    try {
      // If we already have the config, return it
      if (this.guildConfigs.has(guildId)) {
        return this.guildConfigs.get(guildId);
      }

      // Get the global config to access the getVCConfig method
      const globalConfig = await getConfig();
      
      // If the config has a getVCConfig method, use it to get guild-specific config
      if (typeof globalConfig.getVCConfig === 'function') {
        const guildConfig = await globalConfig.getVCConfig(guildId);
        this.guildConfigs.set(guildId, guildConfig);
        return guildConfig;
      }
      
      // Fall back to global config if guild-specific config is not available
      return globalConfig;
    } catch (error) {
      logger.error(`Failed to load config for guild ${guildId}:`, error);
      // Return a default config that won't cause errors
      return {
        enabled: false,
        channelRoles: {}
      };
    }
  }



  /**
   * Get or create the voice role for a guild
   * @param {import('discord.js').Guild} guild - The guild to get/create the role in
   * @returns {Promise<import('discord.js').Role>} The voice role
   */
  async getOrCreateVoiceRole(guild) {
    try {
      const { name, color, mentionable } = this.config.roles.voiceChannel;
      
      // Try to find existing role
      let role = guild.roles.cache.find(r => r.name === name);
      
      // Create role if it doesn't exist
      if (!role) {
        logger.debug(`Creating voice role '${name}' in guild '${guild.name}'`);
        role = await guild.roles.create({
          name,
          color,
          mentionable,
          reason: 'Automatic creation of voice channel role',
        });
        logger.info(`Created voice role '${name}' in guild '${guild.name}'`);
      }
      
      return role;
    } catch (error) {
      logger.error('Error getting/creating voice role', error);
      throw new DatabaseError('Failed to get or create voice role', { error });
    }
  }

  /**
   * Add voice role to a member
   * @param {import('discord.js').GuildMember} member - The member to add the role to
   * @returns {Promise<boolean>} Whether the role was successfully added
   */
  async addVoiceRole(member) {
    try {
      const guildId = member.guild.id;
      logger.info(`[ROLE] Starting role assignment for ${member.user.tag} (${member.id}) in guild ${guildId}`);
      
      // Get guild-specific config
      const config = await this.getGuildConfig(guildId);
      
      // Log current config state
      logger.info(`[ROLE] Voice role config for guild ${guildId}:`, {
        enabled: config?.enabled,
        channelRoles: config?.channelRoles || {},
        configKeys: Object.keys(config || {})
      });
      
      // Log member's current voice state
      logger.info(`[ROLE] Member voice state:`, {
        inVoice: member.voice?.channel ? true : false,
        channel: member.voice?.channel?.name || 'none',
        channelId: member.voice?.channel?.id || 'none',
        currentRoles: member.roles.cache.map(r => r.name).join(', ')
      });
      
      // Check if role management is enabled
      if (!config?.enabled) {
        logger.warn(`[ROLE] Voice role management is disabled in config for guild ${guildId}`);
        return false;
      }

      // Check if member is in a voice channel
      if (!member.voice?.channel) {
        logger.warn(`[ROLE] User ${member.user.tag} is not in a voice channel`);
        return false;
      }

      const channelId = member.voice.channel.id;
      logger.debug(`[DEBUG] User ${member.user.tag} is in voice channel: ${member.voice.channel.name} (${channelId})`);

      // Check if this channel has a role mapping
      logger.info(`[ROLE] Checking role mapping for channel ${channelId} (${member.voice.channel.name})`);
      const roleId = config.channelRoles?.[channelId];
      if (!roleId) {
        logger.warn(`[ROLE] No role mapping found for channel ${channelId} in guild ${guildId}`);
        logger.info(`[ROLE] Available channel mappings:`, config.channelRoles || 'none');
        return false;
      }
      logger.debug(`[DEBUG] Found role mapping for channel ${channelId} -> ${roleId}`);

      // Check if bot has necessary permissions
      const me = member.guild.members.me;
      if (!me) {
        logger.error('[ERROR] Bot member not found in guild');
        return false;
      }
      
      const requiredPermissions = ['ViewChannel', 'Connect', 'Speak', 'ManageRoles'];
      const missingPermissions = requiredPermissions.filter(
        perm => !member.voice.channel.permissionsFor(me).has(perm)
      );
      
      if (missingPermissions.length > 0) {
        logger.error(`[ERROR] Bot is missing required permissions in channel ${member.voice.channel.name}: ${missingPermissions.join(', ')}`);
        return false;
      }
      
      logger.debug(`[DEBUG] Bot has all required permissions in channel ${member.voice.channel.name}`);

      // Get the role
      logger.info(`[ROLE] Attempting to fetch role ${roleId} from guild ${member.guild.name}`);
      const role = await member.guild.roles.fetch(roleId).catch(error => {
        logger.error(`[ROLE] Failed to fetch role ${roleId}:`, error);
        return null;
      });
      
      if (!role) {
        const availableRoles = member.guild.roles.cache.map(r => `${r.name} (${r.id})`).join(', ');
        logger.error(`[ROLE] Role ${roleId} not found in guild ${member.guild.name}`);
        logger.info(`[ROLE] Available roles (${member.guild.roles.cache.size}):`, availableRoles);
        return false;
      }
      logger.debug(`[DEBUG] Successfully fetched role: ${role.name} (${role.id})`);
      
      logger.debug(`[DEBUG] Using role from config: ${role.name} (${role.id})`);
      
      // Check if member already has the role
      if (member.roles.cache.has(role.id)) {
        logger.debug(`[DEBUG] User ${member.user.tag} already has role ${role.name}`);
        return true;
      }

      // Check if bot can manage the role
      if (me.roles.highest.position <= role.position) {
        logger.error(`[ERROR] Bot's highest role (${me.roles.highest.name}) is not above the target role (${role.name})`);
        return false;
      }

      // Add the role to the member
      logger.info(`[ROLE] Attempting to add role ${role.name} (${role.id}) to user ${member.user.tag}`);
      try {
        logger.info(`[ROLE] Bot permissions check:`, {
          canManageRoles: member.guild.members.me.permissions.has('MANAGE_ROLES'),
          botHighestRole: member.guild.members.me.roles.highest.name,
          targetRolePosition: role.position
        });
        
        await member.roles.add(role, `User joined voice channel: ${member.voice.channel.name}`);
        logger.info(`[SUCCESS] Added role ${role.name} to user ${member.user.tag} in guild ${member.guild.name}`);
        
        // Verify the role was added
        const updatedMember = await member.guild.members.fetch(member.id);
        if (updatedMember.roles.cache.has(role.id)) {
          logger.info(`[ROLE] Successfully verified role ${role.name} was added to ${member.user.tag}`);
        } else {
          logger.warn(`[ROLE] Role ${role.name} was not added to ${member.user.tag} (verification failed)`);
        }
      } catch (error) {
        logger.error(`[ERROR] Failed to add role ${role.name} to ${member.user.tag}:`, {
          error: error.message,
          code: error.code,
          stack: error.stack
        });
        throw error;
      }

      // Update cache
      this.updateVoiceStateCache(member.id, channelId);
      return true;
      
    } catch (error) {
      logger.error(`Failed to add voice role to user ${member.id}`, error);
      
      // If the error is due to missing permissions, log it and continue
      if (error.code === 50013) { // Missing Permissions
        logger.error('Bot is missing required permissions to manage roles');
      }
      
      return false;
    }
  }

  /**
   * Remove voice role from a member
   * @param {import('discord.js').GuildMember} member - The member to remove the role from
   * @param {boolean} [force=false] - Whether to force remove the role
   * @returns {Promise<void>}
   */
  async removeVoiceRole(member, force = false) {
    try {
      // Check if role management is enabled
      if (!this.config?.enabled) {
        return;
      }

      // Get the previous channel from cache
      const previousChannelId = this.getVoiceState(member.id);
      if (!previousChannelId) {
        return; // No previous voice state to process
      }

      // Check if the previous channel had a role mapping
      const roleId = this.config.channelRoles?.[previousChannelId];
      if (!roleId) {
        return; // No role mapping for the previous channel
      }

      // Get the role
      const role = await member.guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        logger.error(`[ERROR] Role ${roleId} not found in guild ${member.guild.name}`);
        return;
      }

      // Check if member has the role
      if (member.roles.cache.has(role.id)) {
        // Check if user is still in a channel with the same role mapping
        if (member.voice?.channelId && this.config.channelRoles[member.voice.channelId] === roleId) {
          logger.debug(`[DEBUG] User ${member.user.tag} moved between channels with same role, not removing`);
          return;
        }

        // Remove the role
        await member.roles.remove(role, `User left voice channel: ${previousChannelId}`);
        logger.info(`[SUCCESS] Removed role ${role.name} from user ${member.user.tag} in guild ${member.guild.name}`);
      }

      // Update cache
      this.updateVoiceStateCache(member.id, null);
    } catch (error) {
      logger.error(`Failed to remove voice role from user ${member.id}`, error);
      throw error;
    }
  }

  /**
   * Update the voice state cache
   * @param {string} userId - The user ID
   * @param {string|null} channelId - The channel ID or null if user left voice
   */
  updateVoiceStateCache(userId, channelId) {
    if (channelId) {
      voiceStateCache.set(userId, channelId);
    } else {
      voiceStateCache.delete(userId);
    }
  }

  /**
   * Get the current voice state of a user
   * @param {string} userId - The user ID
   * @returns {string|null} The channel ID or null if user is not in a voice channel
   */
  getVoiceState(userId) {
    return voiceStateCache.get(userId) || null;
  }

  /**
   * Clean up voice roles for all members in a guild
   * @param {import('discord.js').Guild} guild - The guild to clean up
   * @returns {Promise<{removed: number, total: number}>} The number of roles removed and total checked
   */
  async cleanupVoiceRoles(guild) {
    try {
      if (!this.config?.enabled || !this.config.channelRoles) {
        logger.debug('Voice role management is disabled or no channel roles configured');
        return { removed: 0, total: 0 };
      }

      // Get all role IDs from the channel mappings
      const roleIds = new Set(Object.values(this.config.channelRoles));
      if (roleIds.size === 0) {
        logger.debug('No channel roles configured for cleanup');
        return { removed: 0, total: 0 };
      }

      // Get all members and their voice states
      const members = await guild.members.fetch();
      const total = members.size;
      let removed = 0;

      // Get all roles in one query
      const roles = await Promise.all(
        [...roleIds].map(roleId => 
          guild.roles.fetch(roleId).catch(() => null)
        )
      );
      const validRoles = roles.filter(Boolean);

      // Get all voice channel members with their channel IDs
      const voiceChannelMembers = new Map();
      guild.channels.cache
        .filter(c => c.isVoiceBased() && c.members.size > 0)
        .forEach(channel => {
          channel.members.forEach(member => {
            voiceChannelMembers.set(member.id, channel.id);
          });
        });

      // Process each member
      for (const [id, member] of members) {
        try {
          const currentChannelId = voiceChannelMembers.get(id);
          
          // Check each role that might need cleanup
          for (const role of validRoles) {
            if (member.roles.cache.has(role.id)) {
              // If member is in a voice channel, check if it's the one mapped to this role
              if (currentChannelId) {
                const expectedRoleId = this.config.channelRoles[currentChannelId];
                if (expectedRoleId === role.id) {
                  // Member is in the correct channel for this role, keep it
                  continue;
                }
              }
              
              // Remove the role if member is not in a voice channel or in a different channel
              await member.roles.remove(role, 'Voice role cleanup - user not in mapped voice channel');
              removed++;
              logger.debug(`[CLEANUP] Removed role ${role.name} from ${member.user.tag}`);
            }
          }
        } catch (error) {
          logger.error(`Error cleaning up voice roles for member ${id}`, error);
        }
      }

      logger.info(`Cleaned up voice roles in ${guild.name}: Removed ${removed} roles from ${total} members`);
      return { removed, total };
    } catch (error) {
      logger.error('Error during voice role cleanup', error);
      throw new DatabaseError('Failed to clean up voice roles', { error });
    }
  }
}

// Create and export a singleton instance
const voiceRoleManager = new VoiceRoleManager();

// Export the instance
module.exports = voiceRoleManager;

// Also export the class for testing or extension
module.exports.VoiceRoleManager = VoiceRoleManager;
