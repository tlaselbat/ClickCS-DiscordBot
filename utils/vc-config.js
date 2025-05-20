/**
 * Configuration handler for VC settings
 * @module utils/vc-config
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * VC configuration interface
 * @typedef {Object} VCConfig
 * @property {boolean} channelAccessEnabled - Whether channel access is enabled
 * @property {string} channelId - ID of the channel to grant access to
 * @property {boolean} roleAssignmentEnabled - Whether role assignment is enabled
 * @property {string} roleId - ID of the role to assign
 */

/**
 * VCConfig class for managing VC settings
 */
class VCConfig {
    /**
     * Creates a new VCConfig instance
     * @param {string} configDir - Directory to store configuration files
     */
    constructor(configDir) {
        this.configDir = configDir;
        this.defaultConfig = {
            channelAccessEnabled: false,
            channelId: null,
            roleAssignmentEnabled: false,
            roleId: null
        };
    }

    /**
     * Get the configuration file path for a guild
     * @param {string} guildId - The guild ID
     * @returns {string} The configuration file path
     */
    getConfigPath(guildId) {
        return path.join(this.configDir, `${guildId}.json`);
    }

    /**
     * Get VC configuration for a guild
     * @param {string} guildId - The guild ID
     * @returns {Promise<VCConfig>} The VC configuration
     */
    async getVCConfig(guildId) {
        try {
            const configPath = this.getConfigPath(guildId);
            const config = await fs.readFile(configPath, 'utf8');
            return JSON.parse(config);
        } catch (error) {
            // If file doesn't exist, return default config
            return { ...this.defaultConfig };
        }
    }

    /**
     * Save VC configuration for a guild
     * @param {string} guildId - The guild ID
     * @param {VCConfig} config - The VC configuration to save
     * @returns {Promise<void>}
     */
    async saveVCConfig(guildId, config) {
        const configPath = this.getConfigPath(guildId);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
}

module.exports = VCConfig;
