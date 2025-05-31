/**
 * Configuration handler for VC settings
 * @module utils/vc-config
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync, mkdirSync } = require('fs');

/**
 * Channel-Role mapping configuration
 * @typedef {Object} ChannelRoleConfig
 * @property {string} channelId - ID of the voice channel
 * @property {string[]} roleIds - Array of role IDs to assign
 */

/**
 * VC configuration interface
 * @typedef {Object} VCConfig
 * @property {boolean} enabled - Whether voice channel role assignment is enabled
 * @property {Object.<string, string[]>} channelRoles - Mapping of channel IDs to role IDs
 */

/**
 * VCConfig class for managing VC settings
 */
class VCConfig {
    /**
     * Creates a new VCConfig instance
     * @param {string} configDir - Directory to store configuration files
     * @throws {Error} If config directory cannot be created
     */
    constructor(configDir) {
        this.configDir = configDir;
        this.defaultConfig = {
            enabled: true,
            channelRoles: {}
        };

        // Ensure config directory exists
        try {
            // Convert to absolute path and normalize
            const absolutePath = path.isAbsolute(configDir) 
                ? path.normalize(configDir) 
                : path.resolve(process.cwd(), configDir);
                
            // Create directory if it doesn't exist
            if (!existsSync(absolutePath)) {
                mkdirSync(absolutePath, { recursive: true });
            }
            
            // Store the absolute path
            this.configDir = absolutePath;
        } catch (error) {
            throw new Error(`Failed to initialize config directory: ${error.message}`);
        }
    }

    /**
     * Get the configuration file path for a guild
     * @param {string} guildId - The guild ID
     * @returns {string} The configuration file path
     */
    getConfigPath(guildId) {
        if (!guildId) {
            throw new Error('Guild ID is required');
        }
        return path.join(this.configDir, 'guilds', `${guildId}.json`);
    }

    /**
     * Get VC configuration for a guild
     * @param {string} guildId - The guild ID
     * @returns {Promise<VCConfig>} The VC configuration
     * @throws {Error} If configuration cannot be loaded
     */
    async getVCConfig(guildId) {
        const configPath = this.getConfigPath(guildId);
        try {
            // Check if file exists
            const fileExists = await fs.access(configPath).then(() => true).catch(() => false);

            if (!fileExists) {
                // Create default config if file doesn't exist
                await this.saveVCConfig(guildId, this.defaultConfig);
                return { ...this.defaultConfig };
            }

            const config = await fs.readFile(configPath, 'utf8');
            return JSON.parse(config);
        } catch (error) {
            console.error(`Error loading config for guild ${guildId}:`, error);
            // Return default config on error
            return { ...this.defaultConfig };
        }
    }

    /**
     * Save VC configuration for a guild
     * @param {string} guildId - The guild ID
     * @param {VCConfig} config - The VC configuration to save
     * @returns {Promise<void>}
     * @throws {Error} If configuration cannot be saved
     */
    /**
     * Save VC configuration for a guild
     * @param {string} guildId - The guild ID
     * @param {Object} config - The configuration to save
     * @returns {Promise<void>}
     * @throws {Error} If configuration cannot be saved
     */
    async saveVCConfig(guildId, config) {
        const configPath = this.getConfigPath(guildId);
        console.log(`[VC-CONFIG] Attempting to save config for guild ${guildId} to ${configPath}`);
        
        try {
            // Ensure parent directory exists
            const parentDir = path.dirname(configPath);
            console.log(`[VC-CONFIG] Ensuring directory exists: ${parentDir}`);
            
            if (!existsSync(parentDir)) {
                console.log(`[VC-CONFIG] Creating directory: ${parentDir}`);
                mkdirSync(parentDir, { recursive: true });
                console.log(`[VC-CONFIG] Directory created successfully`);
            }

            // Verify we can write to the directory
            try {
                await fs.access(parentDir, fs.constants.W_OK);
                console.log(`[VC-CONFIG] Write access verified for directory: ${parentDir}`);
            } catch (accessError) {
                console.error(`[VC-CONFIG] No write access to directory ${parentDir}:`, accessError);
                throw new Error(`No write access to config directory: ${accessError.message}`);
            }

            // Convert config to string first to catch any JSON serialization errors
            let configString;
            try {
                configString = JSON.stringify(config, null, 2);
                console.log(`[VC-CONFIG] Successfully stringified config`);
            } catch (stringifyError) {
                console.error(`[VC-CONFIG] Failed to stringify config:`, stringifyError);
                throw new Error(`Invalid configuration data: ${stringifyError.message}`);
            }

            // Try to write the file
            console.log(`[VC-CONFIG] Writing config to ${configPath}`);
            await fs.writeFile(configPath, configString, 'utf8');
            console.log(`[VC-CONFIG] Successfully saved config for guild ${guildId}`);
            
            // Verify the file was written
            try {
                const stats = await fs.stat(configPath);
                console.log(`[VC-CONFIG] Config file verified, size: ${stats.size} bytes`);
            } catch (verifyError) {
                console.error(`[VC-CONFIG] Failed to verify config file after write:`, verifyError);
                throw new Error(`Failed to verify config file after write: ${verifyError.message}`);
            }
        } catch (error) {
            console.error(`[VC-CONFIG] Error saving config for guild ${guildId}:`, {
                error: error.message,
                stack: error.stack,
                configPath,
                directory: path.dirname(configPath),
                configKeys: config ? Object.keys(config) : 'no config provided'
            });
            throw new Error(`Failed to save config for guild ${guildId}: ${error.message}`);
        }
    }

    /**
     * Get all guild configurations
     * @returns {Promise<Record<string, VCConfig>>} Map of guild IDs to their configurations
     */
    async getAllConfigs() {
        try {
            const files = await fs.readdir(this.configDir);
            const configs = {};

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const guildId = file.replace('.json', '');
                    configs[guildId] = await this.getVCConfig(guildId);
                }
            }

            return configs;
        } catch (error) {
            throw new Error(`Failed to read all configs: ${error.message}`);
        }
    }
}

module.exports = VCConfig;
