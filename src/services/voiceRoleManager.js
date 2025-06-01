const { Collection } = require('discord.js');
const { getConfig } = require('../config');
const logger = require('../utils/logger');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

class VoiceRoleManager {
  constructor() {
    this.guildConfigs = new Map();
    this.voiceStateCache = new Map(); // Track user voice states
    this.initialized = true;
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

      // Try to load from file directly first
      const fs = require('fs').promises;
      const path = require('path');
      const configPath = path.join(process.cwd(), 'config', 'guilds', `${guildId}.json`);
      
      try {
        // Check if file exists
        await fs.access(configPath);
        
        // Read and parse the config file
        const data = await fs.readFile(configPath, 'utf8');
        const guildConfig = JSON.parse(data);
        
        // Extract channelRoles from the nested structure
        const channelRoles = guildConfig.channelRoles || {};
        const enabled = guildConfig.enabled !== false; // Default to true if not specified
        
        const config = { enabled, channelRoles };
        
        // Cache the config
        this.guildConfigs.set(guildId, config);
        
        logger.info(`[CONFIG] Loaded config for guild ${guildId}`, {
          enabled: config.enabled,
          channelRolesCount: Object.keys(config.channelRoles).length,
          source: 'file'
        });
        
        return config;
        
      } catch (fileError) {
        if (fileError.code === 'ENOENT') {
          logger.warn(`[CONFIG] Config file not found for guild ${guildId}, trying global config`);
        } else {
          logger.error(`[CONFIG] Error reading config file for guild ${guildId}:`, fileError);
        }
      }
      
      // Fallback to global config
      try {
        const globalConfig = await getConfig();
        
        // If the global config has a getVCConfig method, use it
        if (globalConfig && typeof globalConfig.getVCConfig === 'function') {
          const vcConfig = await globalConfig.getVCConfig(guildId);
          
          const config = {
            enabled: vcConfig?.enabled !== false,
            channelRoles: vcConfig?.channelRoles || {}
          };
          
          // Cache the config
          this.guildConfigs.set(guildId, config);
          
          logger.info(`[CONFIG] Loaded config for guild ${guildId}`, {
            enabled: config.enabled,
            channelRolesCount: Object.keys(config.channelRoles).length,
            source: 'global config'
          });
          
          return config;
        }
      } catch (vcError) {
        logger.error(`[CONFIG] Error getting VC config for guild ${guildId}:`, vcError);
      }
      
      // Fallback to default config
      const fallbackConfig = { 
        enabled: true, 
        channelRoles: {}
      };
      
      // Cache the fallback config
      this.guildConfigs.set(guildId, fallbackConfig);
      
      logger.warn(`[CONFIG] Using fallback config for guild ${guildId}`);
      return fallbackConfig;
      
    } catch (error) {
      logger.error(`[CONFIG] Failed to load config for guild ${guildId}:`, error);
      
      // Return default config on error
      return { 
        enabled: true,
        channelRoles: {}
      };
    }
  }
  
  /**
   * Add voice role to a member based on their voice channel
   * @param {import('discord.js').GuildMember} member - The guild member
   * @returns {Promise<boolean>} Whether the role was added successfully
   */
  async addVoiceRole(member) {
    try {
      if (!member?.voice?.channel) return false;
      
      const { guild, voice } = member;
      const channelId = voice.channel.id;
      
      // Get the guild config
      const config = await this.getGuildConfig(guild.id);
      
      // Check if voice roles are enabled
      if (!config.enabled) {
        logger.debug(`[ROLE] Voice roles are disabled for guild ${guild.id}`);
        return false;
      }
      
      // Get the role ID for this channel
      const roleId = config.channelRoles[channelId];
      if (!roleId) {
        logger.debug(`[ROLE] No role mapping found for channel ${channelId} in guild ${guild.id}`);
        return false;
      }
      
      // Get the role
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        logger.error(`[ROLE] Role ${roleId} not found in guild ${guild.id}`);
        return false;
      }
      
      // Add the role to the member
      await member.roles.add(role);
      logger.info(`[ROLE] Added role ${role.name} to ${member.user.tag} in guild ${guild.name}`);
      
      // Verify the role was added by refreshing the member
      try {
        const updatedMember = await guild.members.fetch(member.id);
        const hasRole = updatedMember.roles.cache.has(role.id);
        
        if (!hasRole) {
          logger.warn(`[ROLE] Failed to verify role ${role.id} was added to ${member.user.tag}`);
          return false;
        }
        
        logger.debug(`[ROLE] Successfully verified role ${role.id} was added to ${member.user.tag}`);
      } catch (verifyError) {
        logger.error(`[ROLE] Error verifying role assignment for ${member.user.tag}:`, verifyError);
        return false;
      }
      
      return true;
      
    } catch (error) {
      logger.error(`[ROLE] Failed to add voice role to member ${member?.id}:`, error);
      return false;
    }
  }

  /**
   * Remove roles one by one with delays to avoid rate limits
   * @private
   */
  async removeRolesIndividually(member, roleIds, guild, user) {
    const logPrefix = `[INDIVIDUAL][${guild.id}][${user.id}]`;
    const startTime = Date.now();
    let removedAny = false;
    let rolesProcessed = 0;
    let rolesRemoved = 0;
    let rolesFailed = 0;
    const results = [];

    logger.info(`${logPrefix} === STARTING INDIVIDUAL ROLE REMOVAL ===`);
    logger.info(`${logPrefix} Attempting to remove ${roleIds.length} roles from ${user.tag}`, {
      roleIds,
      memberId: member.id,
      guildId: guild.id,
      timestamp: new Date().toISOString()
    });

    // Log current member state
    try {
      const currentRoles = member.roles.cache.map(role => ({
        id: role.id,
        name: role.name,
        position: role.position,
        managed: role.managed
      }));

      logger.debug(`${logPrefix} Current member roles (${currentRoles.length}):`, {
        roles: currentRoles,
        highestRole: member.roles.highest?.name || 'none',
        highestRolePosition: member.roles.highest?.position || 0
      });
    } catch (logError) {
      logger.warn(`${logPrefix} Failed to log initial member state:`, logError);
    }

    // Process each role
    for (let i = 0; i < roleIds.length; i++) {
      const roleId = roleIds[i];
      const attemptStartTime = Date.now();
      const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
      const roleName = role?.name || 'Unknown Role';
      const rolePosition = role?.position || 0;
      const roleManaged = role?.managed || false;

      const roleContext = {
        roleId,
        roleName,
        rolePosition,
        roleManaged,
        attempt: 1,
        timestamp: new Date().toISOString()
      };

      // Skip if member doesn't have this role
      if (!member.roles.cache.has(roleId)) {
        logger.debug(`${logPrefix} User doesn't have role ${roleName} (${roleId}), skipping`, roleContext);
        results.push({ ...roleContext, status: 'skipped', reason: 'User does not have role' });
        continue;
      }

      // Check if bot can manage this role
      const botMember = guild.members.me;
      const botHighestPosition = botMember?.roles.highest?.position || 0;
      const canManageRole = botMember && botHighestPosition > rolePosition;

      if (!canManageRole) {
        const reason = botMember ? 'Bot role hierarchy too low' : 'Bot member not found';
        logger.warn(`${logPrefix} Cannot remove role ${roleName} (${roleId}): ${reason}`, {
          ...roleContext,
          botHighestRole: botMember?.roles.highest?.name || 'none',
          botHighestPosition: botHighestPosition,
          status: 'failed',
          reason
        });

        results.push({ ...roleContext, status: 'failed', reason });
        failCount++;
        continue;
      }

      // Log role removal attempt
      logger.info(`${logPrefix} [${i + 1}/${roleIds.length}] Removing role ${roleName} (${roleId})`, {
        ...roleContext,
        attempt: 1,
        action: 'starting_removal'
      });

      try {
        // First attempt to remove the role
        await this.removeSingleRoleWithRetry(member, roleId, 'User left voice channel (individual removal)', 2, 1000);

        // Verify removal
        const verifyResult = await this.verifyRoleRemoval(guild, user.id, [roleId], 2, 500);

        if (verifyResult) {
          const duration = Date.now() - attemptStartTime;
          logger.info(`${logPrefix} Successfully removed role ${roleName} (${roleId}) in ${duration}ms`, {
            ...roleContext,
            status: 'success',
            durationMs: duration,
            action: 'role_removed'
          });

          results.push({ ...roleContext, status: 'success', durationMs: duration });
          successCount++;
          removedAny = true;
        } else {
          throw new Error('Role removal verification failed');
        }

      } catch (error) {
        const errorContext = {
          ...roleContext,
          error: error.message,
          stack: error.stack,
          status: 'failed',
          action: 'removal_failed',
          durationMs: Date.now() - attemptStartTime
        };

        logger.error(`${logPrefix} Failed to remove role ${roleName} (${roleId}): ${error.message}`, errorContext);
        results.push(errorContext);
        failCount++;

        // Log detailed error information
        if (error.code === 50013) {
          logger.error(`${logPrefix} Missing permissions to manage role ${roleName} (${roleId})`, {
            ...errorContext,
            requiredPermission: 'MANAGE_ROLES',
            botPermissions: botMember?.permissions.toArray() || []
          });
        }
      }

      // Add a small delay between role removals to avoid rate limits (500ms-1000ms)
      if (i < roleIds.length - 1) {
        const delay = 500 + Math.floor(Math.random() * 500); // Random delay between 500-1000ms
        logger.debug(`${logPrefix} Waiting ${delay}ms before next role removal...`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Refresh member data before next removal
        try {
          member = await guild.members.fetch({ user: user.id, force: true });
          logger.debug(`${logPrefix} Refreshed member data for next role removal`, {
            currentRoles: member.roles.cache.map(r => `${r.name} (${r.id})`),
            rolesRemaining: roleIds.slice(i + 1)
          });
        } catch (refreshError) {
          logger.warn(`${logPrefix} Failed to refresh member data:`, refreshError);
        }
      }
    }

    // Log final results
    const totalTime = Date.now() - startTime;
    const summary = {
      totalRoles: roleIds.length,
      successCount,
      failCount,
      removedAny,
      totalTimeMs: totalTime,
      avgTimePerRole: roleIds.length > 0 ? (totalTime / roleIds.length).toFixed(2) : 0
    };

    logger.info(`${logPrefix} === INDIVIDUAL ROLE REMOVAL COMPLETED ===`, {
      ...summary,
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        roleId: r.roleId,
        roleName: r.roleName,
        status: r.status,
        reason: r.reason || 'n/a',
        durationMs: r.durationMs || 0
      }))
    });

    return removedAny;
  }

  /**
   * Remove voice role from a member
   * @param {import('discord.js').GuildMember} member - The guild member
   * @returns {Promise<boolean>} Whether the role was removed successfully
   */
  /**
   * Remove voice role from a member
   * @param {import('discord.js').GuildMember} member - The guild member
   * @returns {Promise<boolean>} Whether the role was removed successfully
   */
  async removeVoiceRole(member) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    const startTime = Date.now();
    
    if (!member) {
      logger.warn('[ROLE] Cannot remove role: Member is null or undefined');
      return false;
    }
    
    const { guild, user } = member;
    const logPrefix = `[ROLE][${guild.id}][${user.id}]`;
    
    logger.info(`${logPrefix} === STARTING ROLE REMOVAL ===`);
    logger.info(`${logPrefix} Processing role removal for ${user.tag} in ${guild.name}`);
    
    // Log initial member state
    logger.debug(`${logPrefix} Initial member state:`, {
      userId: user.id,
      userTag: user.tag,
      guildId: guild.id,
      guildName: guild.name,
      currentRoles: member.roles.cache.map(r => `${r.name} (${r.id})`),
      highestRole: member.roles.highest?.name || 'none',
      highestRolePosition: member.roles.highest?.position || 0,
      joinedAt: member.joinedAt?.toISOString() || 'unknown',
      premiumSince: member.premiumSince?.toISOString() || 'none'
    });
    
    // Log bot's permissions and state
    const me = guild.members.me;
    if (me) {
      logger.debug(`${logPrefix} Bot state:`, {
        botId: me.id,
        botTag: me.user.tag,
        permissions: me.permissions.toArray(),
        highestRole: me.roles.highest ? `${me.roles.highest.name} (${me.roles.highest.id})` : 'none',
        highestRolePosition: me.roles.highest?.position || 0,
        canManageRoles: me.permissions.has('MANAGE_ROLES'),
        botRoles: me.roles.cache.map(r => `${r.name} (${r.id})`)
      });
    } else {
      logger.error(`${logPrefix} Bot member not found in guild!`);
      return false;
    }
    
    try {
      // Get fresh member data before starting
      try {
        logger.debug(`${logPrefix} Fetching fresh member data...`);
        member = await guild.members.fetch({ user: user.id, force: true });
        logger.debug(`${logPrefix} Successfully refreshed member data`, {
          roles: member.roles.cache.size,
          highestRole: member.roles.highest?.name || 'none',
          highestRolePosition: member.roles.highest?.position || 0
        });
      } catch (fetchError) {
        logger.error(`${logPrefix} Failed to fetch fresh member data:`, fetchError);
        return false;
      }
      
      // Get the guild config
      const config = await this.getGuildConfig(guild.id);
      logger.info(`${logPrefix} Loaded guild config`, {
        enabled: config?.enabled !== false,
        channelRolesCount: config?.channelRoles ? Object.keys(config.channelRoles).length : 0,
        hasConfig: !!config
      });
      
      if (!config?.channelRoles || Object.keys(config.channelRoles).length === 0) {
        logger.warn(`${logPrefix} No voice channel roles configured for this guild`);
        return false;
      }
      
      // Log current roles before removal
      const currentRoles = Array.from(member.roles.cache.values()).map(r => `${r.name} (${r.id})`);
      logger.info(`${logPrefix} Current roles (${currentRoles.length}): ${currentRoles.join(', ')}`);
      
      let rolesToRemove = [];
      const roleDetails = [];
      
      // Find all roles that should be removed and check permissions
      for (const [channelId, roleId] of Object.entries(config.channelRoles)) {
        try {
          if (member.roles.cache.has(roleId)) {
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId);
            if (role) {
              // Check if bot can manage this role
              if (me.roles.highest.position <= role.position) {
                logger.warn(`${logPrefix} Cannot remove role ${role.name} (${roleId}): Bot's highest role (${me.roles.highest.position}) is not above target role (${role.position})`);
                continue;
              }
              rolesToRemove.push(roleId);
              roleDetails.push(`${role.name} (${roleId})`);
              
              logger.debug(`${logPrefix} Role queued for removal: ${role.name} (${role.id})`, {
                rolePosition: role.position,
                botHighestPosition: me.roles.highest?.position || 0,
                canManage: me.roles.highest?.position > role.position
              });
            } else {
              logger.warn(`${logPrefix} Role ${roleId} not found in guild`);
            }
          }
        } catch (roleError) {
          logger.error(`${logPrefix} Error processing role ${roleId}:`, roleError);
        }
      }
      
      if (rolesToRemove.length === 0) {
        logger.info(`${logPrefix} No voice roles to remove from ${user.tag}`);
        return false;
      }
      
      logger.info(`${logPrefix} === ROLE REMOVAL STARTING ===`);
      logger.info(`${logPrefix} Attempting to remove ${rolesToRemove.length} roles: ${roleDetails.join(', ')}`);
      
      // Try batch removal first
      try {
        logger.info(`${logPrefix} Starting batch role removal`);
        const removeStartTime = Date.now();
        
        // Add a small delay before starting removal to ensure previous operations are complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const removalResult = await this.removeRolesWithRetry(
          member, 
          rolesToRemove, 
          'User left voice channel', 
          MAX_RETRIES, 
          RETRY_DELAY
        );
        
        const removeTime = Date.now() - removeStartTime;
        
        if (removalResult) {
          logger.info(`${logPrefix} Successfully removed ${rolesToRemove.length} role(s) in ${removeTime}ms`);
        } else {
          logger.warn(`${logPrefix} Role removal may have partially failed after ${removeTime}ms`);
        }
        
        // Verify removal with multiple checks
        logger.info(`${logPrefix} === VERIFYING ROLE REMOVAL ===`);
        const verifyStartTime = Date.now();
        let verificationPassed = false;
        
        // Try verification multiple times with delays
        for (let i = 0; i < 3; i++) {
          logger.info(`${logPrefix} Verification attempt ${i + 1}/3...`);
          
          try {
            // Refresh member data before verification
            member = await guild.members.fetch({ user: user.id, force: true });
            const currentRoles = member.roles.cache.map(r => r.id);
            const remainingRoles = rolesToRemove.filter(id => currentRoles.includes(id));
            
            if (remainingRoles.length === 0) {
              verificationPassed = true;
              logger.info(`${logPrefix} Verification successful on attempt ${i + 1}`);
              break;
            } else {
              logger.warn(`${logPrefix} Still ${remainingRoles.length} roles remaining after attempt ${i + 1}`);
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between attempts
            }
          } catch (verifyError) {
            logger.error(`${logPrefix} Error during verification attempt ${i + 1}:`, verifyError);
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        const verifyTime = Date.now() - verifyStartTime;
        
        if (verificationPassed) {
          logger.info(`${logPrefix} Successfully verified all roles removed in ${verifyTime}ms`);
          return true;
        } else {
          // Final check with fresh member data
          try {
            member = await guild.members.fetch({ user: user.id, force: true });
            const remainingRoles = rolesToRemove.filter(id => member.roles.cache.has(id));
            
            if (remainingRoles.length > 0) {
              logger.warn(`${logPrefix} Failed to verify removal of ${remainingRoles.length} roles after ${verifyTime}ms`);
              logger.debug(`${logPrefix} Remaining roles: ${remainingRoles.join(', ')}`);
              
              // Try direct API calls for each remaining role
              logger.info(`${logPrefix} Attempting direct API role removal...`);
              let allRemoved = true;
              
              for (const roleId of remainingRoles) {
                try {
                  // Get fresh role data
                  const role = await guild.roles.fetch(roleId);
                  if (!role) {
                    logger.warn(`${logPrefix} Role ${roleId} not found, skipping...`);
                    continue;
                  }
                  
                  // Check if we can manage this role
                  if (me.roles.highest.position <= role.position) {
                    logger.warn(`${logPrefix} Cannot remove role ${role.name} (${roleId}): Bot's role position too low`);
                    allRemoved = false;
                    continue;
                  }
                  
                  // Get fresh member data
                  const freshMember = await guild.members.fetch({ user: user.id, force: true });
                  
                  // Check if member still has the role
                  if (!freshMember.roles.cache.has(roleId)) {
                    logger.info(`${logPrefix} Role ${role.name} (${roleId}) already removed`);
                    continue;
                  }
                  
                  // Remove the role with a fresh member instance
                  logger.info(`${logPrefix} Removing role ${role.name} (${roleId}) via direct API...`);
                  await freshMember.roles.remove(roleId, 'Direct role removal after failed batch removal');
                  
                  // Verify removal with fresh data
                  await new Promise(resolve => setTimeout(resolve, 500));
                  const verifiedMember = await guild.members.fetch({ user: user.id, force: true });
                  
                  if (verifiedMember.roles.cache.has(roleId)) {
                    logger.error(`${logPrefix} Failed to remove role ${role.name} (${roleId}) - still present after removal`);
                    allRemoved = false;
                  } else {
                    logger.info(`${logPrefix} Successfully removed role ${role.name} (${roleId}) via direct API`);
                  }
                } catch (directError) {
                  logger.error(`${logPrefix} Error during direct removal of role ${roleId}:`, directError);
                  allRemoved = false;
                }
                
                // Small delay between individual removals
                await new Promise(resolve => setTimeout(resolve, 300));
              }
              
              if (allRemoved) {
                logger.info(`${logPrefix} Successfully removed all roles via direct API`);
                return true;
              } else {
                logger.error(`${logPrefix} Failed to remove some roles via direct API`);
                return false;
              }
            } else {
              logger.info(`${logPrefix} All roles verified as removed on final check`);
              return true;
            }
          } catch (finalError) {
            logger.error(`${logPrefix} Error during final verification:`, finalError);
            return false;
          }
        }
      } catch (error) {
        const errorTime = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.error(`${logPrefix} Batch role removal failed after ${errorTime}s:`, error);
        
        // Fall back to individual removal with fresh member data
        try {
          logger.info(`${logPrefix} === FALLING BACK TO INDIVIDUAL ROLE REMOVAL ===`);
          logger.info(`${logPrefix} Fetching fresh member data for fallback...`);
          
          // Get fresh member data before falling back
          member = await guild.members.fetch({ user: user.id, force: true });
          
          // Re-check which roles still need to be removed
          const remainingRoles = rolesToRemove.filter(id => member.roles.cache.has(id));
          
          if (remainingRoles.length === 0) {
            logger.info(`${logPrefix} All roles were already removed successfully`);
            return true;
          }
          
          logger.info(`${logPrefix} Attempting to remove ${remainingRoles.length} roles individually`);
          
          // Try direct API calls for each role
          let allRemoved = true;
          
          for (const roleId of remainingRoles) {
            try {
              // Get fresh role data
              const role = await guild.roles.fetch(roleId);
              if (!role) {
                logger.warn(`${logPrefix} Role ${roleId} not found, skipping...`);
                continue;
              }
              
              // Check if we can manage this role
              if (me.roles.highest.position <= role.position) {
                logger.warn(`${logPrefix} Cannot remove role ${role.name} (${roleId}): Bot's role position too low`);
                allRemoved = false;
                continue;
              }
              
              // Get fresh member data
              const freshMember = await guild.members.fetch({ user: user.id, force: true });
              
              // Check if member still has the role
              if (!freshMember.roles.cache.has(roleId)) {
                logger.info(`${logPrefix} Role ${role.name} (${roleId}) already removed`);
                continue;
              }
              
              // Remove the role with a fresh member instance
              logger.info(`${logPrefix} Removing role ${role.name} (${roleId}) via direct API...`);
              await freshMember.roles.remove(roleId, 'Direct role removal in fallback');
              
              // Verify removal with fresh data
              await new Promise(resolve => setTimeout(resolve, 500));
              const verifiedMember = await guild.members.fetch({ user: user.id, force: true });
              
              if (verifiedMember.roles.cache.has(roleId)) {
                logger.error(`${logPrefix} Failed to remove role ${role.name} (${roleId}) - still present after removal`);
                allRemoved = false;
              } else {
                logger.info(`${logPrefix} Successfully removed role ${role.name} (${roleId}) via direct API`);
              }
            } catch (directError) {
              logger.error(`${logPrefix} Error during direct removal of role ${roleId}:`, directError);
              allRemoved = false;
            }
            
            // Small delay between individual removals
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          if (allRemoved) {
            logger.info(`${logPrefix} Successfully removed all roles via direct API in fallback`);
          } else {
            logger.error(`${logPrefix} Failed to remove some roles via direct API in fallback`);
          }
          
          return allRemoved;
          
        } catch (fallbackError) {
          logger.error(`${logPrefix} Critical error during fallback removal:`, fallbackError);
          return false;
        }
      }
      
    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.error(`${logPrefix} === ROLE REMOVAL FAILED AFTER ${totalTime}s ===`);
      logger.error(`${logPrefix} Failed to remove voice role from ${member?.user?.tag || 'unknown'}:`, {
        error: error.message,
        stack: error.stack,
        guildId: guild?.id,
        userId: user?.id,
        rolesAttempted: rolesToRemove || 'unknown'
      });
      
      // Log final member state for debugging
      try {
        if (guild && user) {
          const finalMember = await guild.members.fetch({ user: user.id, force: true }).catch(() => null);
          if (finalMember) {
            logger.debug(`${logPrefix} Final member roles:`, {
              roles: finalMember.roles.cache.map(r => `${r.name} (${r.id})`),
              roleCount: finalMember.roles.cache.size
            });
          }
        }
      } catch (finalCheckError) {
        logger.error(`${logPrefix} Error during final member state check:`, finalCheckError);
      }
      
      return false;
    } finally {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`${logPrefix} === ROLE REMOVAL COMPLETED IN ${totalTime}s ===`);
    }
  }
  
  /**
   * Remove roles with retry logic
   * @private
   */
  /**
   * Remove roles with retry logic and direct REST API fallback
   * @private
   */
  async removeRolesWithRetry(member, roleIds, reason, maxRetries = 3, delay = 1000) {
    const startTime = Date.now();
    let lastError;
    const { user, guild } = member;
    const logPrefix = `[ROLE][${guild.id}][${user.id}]`;
    
    // Log detailed member and bot information
    logger.debug(`${logPrefix} Member details:`, {
      userId: user.id,
      userTag: user.tag,
      currentRoles: member.roles.cache.map(r => `${r.name} (${r.id})`),
      highestRole: member.roles.highest?.name || 'none',
      highestRolePosition: member.roles.highest?.position || 0
    });
    
    // Log bot permissions and roles
    const botMember = guild.members.me;
    logger.debug(`${logPrefix} Bot details:`, {
      botId: botMember?.id || 'unknown',
      botTag: botMember?.user.tag || 'unknown',
      canManageRoles: botMember?.permissions.has('MANAGE_ROLES') || false,
      highestRole: botMember?.roles.highest?.name || 'none',
      highestRolePosition: botMember?.roles.highest?.position || 0,
      botRoles: botMember?.roles.cache.map(r => `${r.name} (${r.id})`) || []
    });
    
    // Log initial attempt with context
    logger.info(`${logPrefix} Starting role removal with ${maxRetries} retries`, {
      rolesToRemove: roleIds.map(id => `${id} (${guild.roles.cache.get(id)?.name || 'unknown'})`),
      reason: reason || 'No reason provided',
      userRoles: member.roles.cache.size,
      botHighestRole: botMember?.roles.highest?.name || 'unknown',
      botCanManageRoles: botMember?.permissions.has('MANAGE_ROLES') || false,
      botHighestRolePosition: botMember?.roles.highest?.position || 0
    });
    
    // Filter out roles the user doesn't have and check bot permissions
    const rolesToRemove = [];
    for (const id of roleIds) {
      if (member.roles.cache.has(id)) {
        const role = guild.roles.cache.get(id);
        if (role) {
          const canManage = botMember?.roles.highest?.position > role.position;
          logger.debug(`${logPrefix} Role removal check: ${role.name} (${id}) - ${canManage ? 'Can remove' : 'Cannot remove'}`);
          if (canManage) {
            rolesToRemove.push(id);
          } else {
            logger.warn(`${logPrefix} Cannot remove role ${role.name} (${id}) - Bot's highest role is not above target role`);
          }
        } else {
          logger.warn(`${logPrefix} Role ${id} not found in guild`);
        }
      }
    }
    
    if (rolesToRemove.length === 0) {
      const status = roleIds.length > 0 ? 'No removable roles found' : 'No roles to remove';
      logger.info(`${logPrefix} ${status} - User may not have roles or bot lacks permissions`);
      return false;
    }
    
    logger.debug(`${logPrefix} Removing ${rolesToRemove.length} roles: ${rolesToRemove.join(', ')}`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      const attemptPrefix = `${logPrefix}[ATTEMPT ${attempt}/${maxRetries}]`;
      
      try {
        // Log attempt details
        logger.info(`${attemptPrefix} Removing roles...`, {
          roles: rolesToRemove,
          memberId: member.id,
          guildId: guild.id
        });
        
        // Check if member still has the roles before attempting removal
        const currentRoles = member.roles.cache.map(r => r.id);
        const existingRoles = rolesToRemove.filter(id => currentRoles.includes(id));
        
        if (existingRoles.length === 0) {
          logger.info(`${attemptPrefix} All roles already removed`);
          return true;
        }
        
        logger.debug(`${attemptPrefix} User currently has ${existingRoles.length} of ${rolesToRemove.length} roles to remove`);
        
        // Log before removal
        logger.debug(`${attemptPrefix} Attempting to remove ${existingRoles.length} roles:`, {
          roles: existingRoles.map(id => {
            const role = guild.roles.cache.get(id);
            return role ? `${role.name} (${id})` : id;
          }),
          memberId: member.id,
          memberTag: member.user.tag,
          attempt,
          maxRetries
        });
        
        // Perform the role removal with enhanced verification
        try {
          // Initial role removal attempt
          await member.roles.remove(existingRoles, `${reason} (Attempt ${attempt}/${maxRetries})`);
          logger.debug(`${attemptPrefix} Initial role removal API call completed`);
          
          // Add a small initial delay
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Enhanced verification with multiple attempts
          let verificationPassed = false;
          let remainingRoles = [...existingRoles];
          const maxVerificationAttempts = 3;
          
          for (let verifyAttempt = 1; verifyAttempt <= maxVerificationAttempts; verifyAttempt++) {
            // Increasing delay between verification attempts
            const verifyDelay = 300 * verifyAttempt;
            logger.debug(`${attemptPrefix} Verification attempt ${verifyAttempt}/${maxVerificationAttempts} - Waiting ${verifyDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, verifyDelay));
            
            try {
              // Get fresh member data
              const updatedMember = await guild.members.fetch({ user: user.id, force: true });
              logger.debug(`${attemptPrefix} Verification attempt ${verifyAttempt} - Refreshed member data`);
              
              // Check which roles are still present
              const rolesAfterRemoval = updatedMember.roles.cache.map(r => r.id);
              remainingRoles = existingRoles.filter(id => rolesAfterRemoval.includes(id));
              
              if (remainingRoles.length === 0) {
                verificationPassed = true;
                logger.debug(`${attemptPrefix} All roles verified as removed on attempt ${verifyAttempt}`);
                break;
              }
              
              logger.warn(`${attemptPrefix} Verification attempt ${verifyAttempt} - ${remainingRoles.length} roles still present`);
              
              // If we have remaining roles, try removing them individually
              for (const roleId of [...remainingRoles]) {
                try {
                  const role = guild.roles.cache.get(roleId);
                  if (role) {
                    logger.debug(`${attemptPrefix} Attempting individual removal of role ${role.name} (${roleId})`);
                    await updatedMember.roles.remove(roleId, `${reason} (Individual retry ${verifyAttempt}/${maxVerificationAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between individual removals
                  }
                } catch (individualError) {
                  logger.error(`${attemptPrefix} Failed to remove individual role ${roleId}:`, individualError);
                }
              }
              
            } catch (verifyError) {
              logger.error(`${attemptPrefix} Error during verification attempt ${verifyAttempt}:`, verifyError);
            }
          }
          
          // Final verification with direct REST API call
          if (!verificationPassed && remainingRoles.length > 0) {
            logger.warn(`${attemptPrefix} Falling back to direct REST API for role removal`);
            
            // Try direct REST API call as last resort
            try {
              // Get fresh member data
              const freshMember = await guild.members.fetch({ user: user.id, force: true });
              
              // Remove roles one by one with direct REST API
              for (const roleId of remainingRoles) {
                try {
                  const role = guild.roles.cache.get(roleId);
                  if (!role) {
                    logger.warn(`${attemptPrefix} Role ${roleId} not found in guild`);
                    continue;
                  }
                  
                  // Log role and bot position info
                  logger.debug(`${attemptPrefix} Role removal details:`, {
                    roleName: role.name,
                    rolePosition: role.position,
                    botHighestRole: botMember.roles.highest?.name,
                    botHighestPosition: botMember.roles.highest?.position,
                    canManage: botMember.roles.highest?.position > role.position
                  });
                  
                  // Use direct REST API to remove the role
                  logger.debug(`${attemptPrefix} Removing role ${role.name} (${roleId}) using direct API...`);
                  
                  // Try both methods to ensure the role is removed
                  try {
                    // Method 1: Using guild.members.removeRole
                    await guild.members.removeRole({
                      user: user.id,
                      role: roleId,
                      reason: `${reason} (Direct API fallback)`
                    });
                  } catch (removeError) {
                    logger.warn(`${attemptPrefix} Method 1 failed: ${removeError.message}`);
                    
                    // Method 2: Using member.roles.remove with direct API call
                    try {
                      const tempMember = await guild.members.fetch({ user: user.id, force: true });
                      await tempMember.roles.remove(roleId, `${reason} (Direct API fallback - Method 2)`);
                    } catch (method2Error) {
                      logger.error(`${attemptPrefix} Method 2 failed: ${method2Error.message}`);
                      throw method2Error; // Re-throw to be caught by the outer catch
                    }
                  }
                  
                  // Verify removal with multiple attempts
                  let verified = false;
                  for (let verifyAttempt = 1; verifyAttempt <= 3; verifyAttempt++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const updatedMember = await guild.members.fetch({ user: user.id, force: true });
                    
                    if (!updatedMember.roles.cache.has(roleId)) {
                      verified = true;
                      logger.info(`${attemptPrefix} Successfully removed role ${role.name} (${roleId}) using direct API (attempt ${verifyAttempt})`);
                      break;
                    }
                    
                    logger.warn(`${attemptPrefix} Role ${role.name} (${roleId}) still exists after removal attempt ${verifyAttempt}`);
                  }
                  
                  if (!verified) {
                    throw new Error(`Failed to verify removal of role ${role.name} (${roleId})`);
                  }
                  
                } catch (directApiError) {
                  logger.error(`${attemptPrefix} Failed to remove role ${roleId} using direct API:`, directApiError);
                  throw directApiError; // Re-throw to trigger retry
                }
              }
              
              // Final verification
              const finalCheck = await guild.members.fetch({ user: user.id, force: true });
              remainingRoles = existingRoles.filter(id => finalCheck.roles.cache.has(id));
              verificationPassed = remainingRoles.length === 0;
              
              if (verificationPassed) {
                logger.info(`${attemptPrefix} Successfully removed all roles using direct API fallback`);
              } else {
                logger.error(`${attemptPrefix} Failed to remove ${remainingRoles.length} roles even with direct API`);
              }
            } catch (finalError) {
              logger.error(`${attemptPrefix} Critical error during direct API fallback:`, finalError);
              remainingRoles = existingRoles; // Reset to original list
              throw finalError; // Re-throw to trigger retry
            }
          }
          
          // Log final result
          const attemptTime = Date.now() - attemptStartTime;
          if (verificationPassed) {
            logger.info(`${attemptPrefix} Successfully removed ${existingRoles.length} role(s) in ${attemptTime}ms`);
            return true;
          } else {
            logger.error(`${attemptPrefix} Failed to remove ${remainingRoles.length} roles after ${maxVerificationAttempts} verification attempts`);
            throw new Error(`Failed to remove ${remainingRoles.length} roles: ${remainingRoles.join(', ')}`);
          }
          
        } catch (removeError) {
          logger.error(`${attemptPrefix} Critical error during role removal:`, removeError);
          throw removeError;
        }
        
      } catch (error) {
        lastError = error;
        const attemptTime = Date.now() - attemptStartTime;
        const errorDetails = {
          error: error.message,
          stack: error.stack,
          attempt,
          maxRetries,
          timeElapsed: attemptTime,
          userId: user.id,
          guildId: guild.id,
          rolesAttempted: rolesToRemove
        };
        
        logger.error(`${attemptPrefix} Role removal failed after ${attemptTime}ms`, errorDetails);
        
        if (attempt < maxRetries) {
          const nextRetryIn = delay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`${attemptPrefix} Retrying in ${nextRetryIn}ms...`);
          await new Promise(resolve => setTimeout(resolve, nextRetryIn));
          
          try {
            // Refresh member data before next attempt
            member = await guild.members.fetch({ user: user.id, force: true });
            logger.debug(`${attemptPrefix} Successfully refreshed member data for retry`);
          } catch (fetchError) {
            logger.error(`${attemptPrefix} Failed to refresh member data:`, fetchError);
            // Continue to next attempt even if refresh fails
          }
          
          // Update roles to remove based on current member state
          const currentRoles = member.roles.cache.map(r => r.id);
          const newRolesToRemove = rolesToRemove.filter(id => currentRoles.includes(id));
          if (newRolesToRemove.length === 0) {
            logger.info(`${attemptPrefix} All roles already removed during retry`);
            return true;
          }
        }
      }
    }
    
    const totalTime = (Date.now() - startTime) / 1000;
    const errorMessage = `Failed to remove roles after ${maxRetries} attempts (${totalTime.toFixed(2)}s)`;
    logger.error(`${logPrefix} ${errorMessage}`, {
      userId: user.id,
      guildId: guild.id,
      rolesAttempted: rolesToRemove,
      lastError: lastError?.message || 'Unknown error',
      errorStack: lastError?.stack
    });
    
    throw lastError || new Error(errorMessage);
  }
  
  /**
   * Verify that roles were actually removed
   * @private
   */
  async verifyRoleRemoval(guild, userId, roleIds, maxRetries = 3, delay = 1000) {
    logger.info(`[VERIFY] Starting verification for user ${userId} with ${maxRetries} retries`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`[VERIFY] Verification attempt ${attempt}/${maxRetries} for user ${userId}`);
        
        // Force fetch the latest member data
        const member = await guild.members.fetch({ user: userId, force: true });
        logger.debug(`[VERIFY] Fetched member data for ${userId}, roles: ${member.roles.cache.size}`);
        
        // Check each role
        const rolesStillPresent = [];
        for (const roleId of roleIds) {
          const hasRole = member.roles.cache.has(roleId);
          if (hasRole) {
            const role = guild.roles.cache.get(roleId);
            rolesStillPresent.push(role ? `${role.name} (${roleId})` : `Unknown Role (${roleId})`);
          }
        }
        
        if (rolesStillPresent.length === 0) {
          logger.info(`[VERIFY] Successfully verified all roles removed from user ${userId}`);
          return true;
        }
        
        logger.warn(`[VERIFY] User ${userId} still has ${rolesStillPresent.length} roles: ${rolesStillPresent.join(', ')}`);
        
        if (attempt < maxRetries) {
          logger.warn(`[VERIFY] Retrying in ${delay}ms... (${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error(`[VERIFY] Error during verification attempt ${attempt}: ${error.message}`, {
          error: error.message,
          stack: error.stack,
          guildId: guild.id,
          userId,
          attempt
        });
        
        if (attempt >= maxRetries) {
          logger.error(`[VERIFY] All ${maxRetries} verification attempts failed for user ${userId}`);
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    logger.warn(`[VERIFY] Failed to verify role removal for user ${userId} after ${maxRetries} attempts`);
    return false;
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
  /**
   * Remove a role using direct REST API calls
   * @private
   */
  async _removeRoleDirectly(guild, userId, roleId, reason = 'No reason provided') {
    try {
      logger.debug(`[REST] Attempting to remove role ${roleId} from user ${userId} in guild ${guild.name}`);
      
      // Get fresh member data
      const member = await guild.members.fetch({ user: userId, force: true });
      if (!member.roles.cache.has(roleId)) {
        logger.debug(`[REST] User ${userId} does not have role ${roleId} (already removed?)`);
        return true;
      }

      // Get the role to check permissions
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        logger.error(`[REST] Role ${roleId} not found in guild ${guild.name}`);
        return false;
      }

      // Check if bot can manage this role
      const me = guild.members.me;
      if (me.roles.highest.position <= role.position) {
        logger.error(`[REST] Cannot remove role ${role.name} (${role.id}): Bot's highest role (${me.roles.highest.name}) is not above target role (${role.name})`);
        return false;
      }

      // Use the REST API directly
      const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);
      await rest.delete(
        Routes.guildMemberRole(guild.id, userId, roleId),
        { reason: reason }
      );

      // Verify removal
      await new Promise(resolve => setTimeout(resolve, 500));
      const updatedMember = await guild.members.fetch({ user: userId, force: true });
      
      if (updatedMember.roles.cache.has(roleId)) {
        throw new Error(`Role ${roleId} still exists after direct API removal`);
      }

      logger.info(`[REST] Successfully removed role ${role.name} (${roleId}) from user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`[REST] Failed to remove role ${roleId} from user ${userId}:`, error);
      throw error;
    }
  }

  async removeVoiceRole(member, force = false) {
    try {
      // Get guild config
      const guildConfig = await this.getGuildConfig(member.guild.id);
      
      // Check if role management is enabled for this guild
      if (!guildConfig?.enabled) {
        logger.debug(`[ROLE_REMOVE] Role management is disabled for guild ${member.guild.id}`);
        return;
      }
      
      const logPrefix = `[ROLE_REMOVE] [${member.user.tag} (${member.id})]`;
      logger.info(`${logPrefix} Starting role removal process`);

      // Get the previous channel from cache
      const previousChannelId = this.getVoiceState(member.id);
      if (!previousChannelId) {
        logger.debug(`${logPrefix} No previous voice state found in cache`);
        return; // No previous voice state to process
      }

      // Debug log the channel roles
      logger.debug(`${logPrefix} Available channel roles:`, guildConfig.channelRoles);
      
      // Check if the previous channel had a role mapping
      const roleId = guildConfig.channelRoles?.[previousChannelId];
      if (!roleId) {
        logger.debug(`${logPrefix} No role mapping found for channel ${previousChannelId}. Available mappings:`, 
          Object.entries(guildConfig.channelRoles || {}).map(([ch, rId]) => `${ch} -> ${rId}`).join(', ')
        );
        return; // No role mapping for the previous channel
      }

      // Get the role
      const role = await member.guild.roles.fetch(roleId).catch((error) => {
        logger.error(`${logPrefix} Failed to fetch role ${roleId}:`, error);
        return null;
      });
      
      if (!role) {
        logger.error(`${logPrefix} Role ${roleId} not found in guild ${member.guild.name}`);
        return;
      }

      // Check if member has the role
      if (member.roles.cache.has(role.id)) {
        // Check if user is still in a channel with the same role mapping
        if (member.voice?.channelId && guildConfig.channelRoles?.[member.voice.channelId] === roleId) {
          logger.debug(`${logPrefix} User moved between channels with same role, not removing`);
          return;
        }

        logger.info(`${logPrefix} Attempting to remove role ${role.name} (${role.id})`);
        
        // Try using guild member manager
        try {
          // Get a fresh member instance
          const freshMember = await member.guild.members.fetch({ 
            user: member.user.id, 
            force: true 
          }).catch(error => {
            logger.error(`${logPrefix} Failed to fetch fresh member:`, error);
            return null;
          });
          
          if (!freshMember) {
            throw new Error('Failed to fetch fresh member data');
          }
          
          // Check if user still has the role
          if (!freshMember.roles.cache.has(role.id)) {
            logger.info(`${logPrefix} User no longer has the role, skipping`);
            return;
          }
          
          // Log current roles before removal
          logger.debug(`${logPrefix} Current roles before removal:`, 
            freshMember.roles.cache.map(r => `${r.name} (${r.id})`).join(', ')
          );
          
          // Try removing using guild member manager
          await freshMember.roles.remove(
            role, 
            `User left voice channel: ${previousChannelId}`
          ).catch(error => {
            logger.error(`${logPrefix} Failed to remove role using guild member manager:`, error);
            throw error;
          });
          
          // Verify removal with a fresh fetch
          await new Promise(resolve => setTimeout(resolve, 500));
          const verifiedMember = await member.guild.members.fetch({ 
            user: member.user.id, 
            force: true 
          });
          
          if (verifiedMember.roles.cache.has(role.id)) {
            throw new Error(`Role ${role.name} still exists after removal`);
          }
          
          logger.info(`${logPrefix} Successfully removed role ${role.name} (${role.id})`);
          
        } catch (error) {
          logger.error(`${logPrefix} Failed to remove role:`, error);
          throw error;
        }
      }

      // Update cache
      this.updateVoiceStateCache(member.id, null);
      logger.info(`${logPrefix} Successfully completed role removal process`);
    } catch (error) {
      logger.error(`[ERROR] Failed to remove voice role from user ${member.id}:`, error);
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
      this.voiceStateCache.set(userId, channelId);
    } else {
      this.voiceStateCache.delete(userId);
    }
  }

  /**
   * Get the current voice state of a user
   * @param {string} userId - The user ID
   * @returns {string|null} The channel ID or null if user is not in a voice channel
   */
  getVoiceState(userId) {
    return this.voiceStateCache.get(userId) || null;
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

// Add config property for backward compatibility
Object.defineProperty(voiceRoleManager, 'config', {
  get() {
    return {
      enabled: true,
      channelRoles: {}
    };
  }
});

// Export the instance
module.exports = voiceRoleManager;

// Also export the class for testing or extension
module.exports.VoiceRoleManager = VoiceRoleManager;
