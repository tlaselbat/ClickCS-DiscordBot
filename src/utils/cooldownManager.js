const { Collection } = require('discord.js');
const logger = require('./logger');

/**
 * Manages cooldowns for commands and interactions
 */
class CooldownManager {
  constructor() {
    /** @type {Map<string, Collection<string, {timestamp: number, uses: number}>>} */
    this.cooldowns = new Map();
    this.globalCooldowns = new Collection();
  }

  /**
   * Set a cooldown for a user
   * @param {string} type - The type of cooldown (e.g., 'command', 'button')
   * @param {string} id - The ID of the item (e.g., command name, button ID)
   * @param {string} userId - The user's ID
   * @param {number} cooldown - Cooldown duration in milliseconds
   * @param {number} [maxUses=1] - Maximum number of uses before cooldown applies
   * @returns {void}
   */
  setCooldown(type, id, userId, cooldown, maxUses = 1) {
    if (!this.cooldowns.has(type)) {
      this.cooldowns.set(type, new Collection());
    }
    
    const typeCooldowns = this.cooldowns.get(type);
    const key = `${id}:${userId}`;
    
    typeCooldowns.set(key, {
      timestamp: Date.now() + cooldown,
      uses: maxUses
    });
    
    // Set a timeout to clean up the cooldown
    setTimeout(() => {
      const current = typeCooldowns.get(key);
      if (current && current.timestamp <= Date.now()) {
        typeCooldowns.delete(key);
      }
    }, cooldown);
  }

  /**
   * Set a global cooldown for an item
   * @param {string} type - The type of cooldown
   * @param {string} id - The ID of the item
   * @param {number} cooldown - Cooldown duration in milliseconds
   * @returns {void}
   */
  setGlobalCooldown(type, id, cooldown) {
    const key = `${type}:${id}`;
    this.globalCooldowns.set(key, Date.now() + cooldown);
    
    // Set a timeout to clean up the global cooldown
    setTimeout(() => {
      if (this.globalCooldowns.get(key) <= Date.now()) {
        this.globalCooldowns.delete(key);
      }
    }, cooldown);
  }

  /**
   * Check if a user is on cooldown
   * @param {string} type - The type of cooldown
   * @param {string} id - The ID of the item
   * @param {string} userId - The user's ID
   * @returns {{cooldown: boolean, remaining: number, global: boolean}}
   */
  isOnCooldown(type, id, userId) {
    // Check global cooldown first
    const globalKey = `${type}:${id}`;
    const globalCooldown = this.globalCooldowns.get(globalKey) || 0;
    const now = Date.now();
    
    if (globalCooldown > now) {
      return {
        cooldown: true,
        remaining: Math.ceil((globalCooldown - now) / 1000),
        global: true
      };
    }
    
    // Check user-specific cooldown
    const userKey = `${id}:${userId}`;
    const typeCooldowns = this.cooldowns.get(type);
    
    if (!typeCooldowns || !typeCooldowns.has(userKey)) {
      return { cooldown: false, remaining: 0, global: false };
    }
    
    const cooldown = typeCooldowns.get(userKey);
    
    // Decrement uses if needed
    if (cooldown.uses > 1) {
      cooldown.uses--;
      return { cooldown: false, remaining: 0, global: false };
    }
    
    // Check if cooldown has expired
    if (cooldown.timestamp <= now) {
      typeCooldowns.delete(userKey);
      return { cooldown: false, remaining: 0, global: false };
    }
    
    // Still on cooldown
    return {
      cooldown: true,
      remaining: Math.ceil((cooldown.timestamp - now) / 1000),
      global: false
    };
  }

  /**
   * Get remaining cooldown time
   * @param {string} type - The type of cooldown
   * @param {string} id - The ID of the item
   * @param {string} userId - The user's ID
   * @returns {number} Remaining cooldown in seconds
   */
  getRemainingCooldown(type, id, userId) {
    const result = this.isOnCooldown(type, id, userId);
    return result.cooldown ? result.remaining : 0;
  }

  /**
   * Clear a cooldown for a user
   * @param {string} type - The type of cooldown
   * @param {string} id - The ID of the item
   * @param {string} userId - The user's ID
   * @returns {boolean} Whether the cooldown was cleared
   */
  clearCooldown(type, id, userId) {
    if (!this.cooldowns.has(type)) return false;
    
    const typeCooldowns = this.cooldowns.get(type);
    const key = `${id}:${userId}`;
    
    return typeCooldowns.delete(key);
  }

  /**
   * Clear all cooldowns for a user
   * @param {string} userId - The user's ID
   * @returns {number} Number of cooldowns cleared
   */
  clearUserCooldowns(userId) {
    let count = 0;
    
    for (const [type, typeCooldowns] of this.cooldowns) {
      for (const [key] of typeCooldowns) {
        if (key.endsWith(`:${userId}`)) {
          typeCooldowns.delete(key);
          count++;
        }
      }
    }
    
    return count;
  }

  /**
   * Clear all cooldowns
   * @returns {void}
   */
  clearAllCooldowns() {
    this.cooldowns.clear();
    this.globalCooldowns.clear();
  }
}

// Create and export a singleton instance
const cooldownManager = new CooldownManager();

module.exports = cooldownManager;
module.exports.CooldownManager = CooldownManager;
