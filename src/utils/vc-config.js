/**
 * Configuration handler for VC settings
 * @module utils/vc-config
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync, mkdirSync } = require('fs');
const logger = require('./logger');

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
        const guildsDir = path.join(this.configDir, 'guilds');
        
        logger.info(`[VC-CONFIG] Loading config for guild ${guildId}`);
        logger.debug(`[VC-CONFIG] Config path: ${configPath}`);
        
        try {
            // Check if guilds directory exists
            const guildsDirExists = await fs.access(guildsDir).then(() => true).catch(() => false);
            logger.debug(`[VC-CONFIG] Guilds directory exists: ${guildsDirExists}`);
            
            if (!guildsDirExists) {
                logger.warn(`[VC-CONFIG] Guilds directory does not exist, creating it`);
                await fs.mkdir(guildsDir, { recursive: true });
                logger.info(`[VC-CONFIG] Created guilds directory at ${guildsDir}`);
            }
            
            // Check if file exists
            const fileExists = await fs.access(configPath).then(() => true).catch(() => false);
            logger.debug(`[VC-CONFIG] Config file exists: ${fileExists}`);

            if (!fileExists) {
                logger.warn(`[VC-CONFIG] Config file not found for guild ${guildId}, creating default config`);
                // Create default config if file doesn't exist
                await this.saveVCConfig(guildId, this.defaultConfig);
                logger.info(`[VC-CONFIG] Created default config for guild ${guildId}`);
                return { ...this.defaultConfig };
            }

            logger.debug(`[VC-CONFIG] Reading config file for guild ${guildId}`);
            const configData = await fs.readFile(configPath, 'utf8');
            logger.debug(`[VC-CONFIG] Raw config data:`, configData);
            
            let config;
            try {
                config = JSON.parse(configData);
                logger.debug(`[VC-CONFIG] Successfully parsed config for guild ${guildId}`);
            } catch (parseError) {
                logger.error(`[VC-CONFIG] Failed to parse config for guild ${guildId}:`, parseError);
                logger.warn(`[VC-CONFIG] Using default config due to parse error`);
                return { ...this.defaultConfig };
            }
            
            logger.info(`[VC-CONFIG] Successfully loaded config for guild ${guildId}`, {
                hasConfig: !!config,
                configKeys: config ? Object.keys(config) : 'no config',
                hasChannelRoles: !!(config && config.channelRoles),
                channelRolesCount: config && config.channelRoles ? Object.keys(config.channelRoles).length : 0
            });
            
            return config;
        } catch (error) {
            logger.error(`[VC-CONFIG] Error loading config for guild ${guildId}:`, {
                error: error.message,
                stack: error.stack,
                configPath: configPath,
                configDir: path.dirname(configPath)
            });
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
        const parentDir = path.dirname(configPath);
        
        logger.info(`[VC-CONFIG] Attempting to save config for guild ${guildId} to ${configPath}`);
        logger.debug(`[VC-CONFIG] Config to save:`, {
            enabled: config.enabled,
            channelRolesCount: config.channelRoles ? Object.keys(config.channelRoles).length : 0,
            configKeys: Object.keys(config)
        });
        
        try {
            // Ensure parent directory exists
            logger.debug(`[VC-CONFIG] Ensuring directory exists: ${parentDir}`);
            
            if (!existsSync(parentDir)) {
                logger.warn(`[VC-CONFIG] Directory does not exist, creating: ${parentDir}`);
                mkdirSync(parentDir, { recursive: true });
                logger.info(`[VC-CONFIG] Directory created successfully`);
            }

            // Verify we can write to the directory
            try {
                await fs.access(parentDir, fs.constants.W_OK);
                logger.debug(`[VC-CONFIG] Write access verified for directory: ${parentDir}`);
            } catch (accessError) {
                logger.error(`[VC-CONFIG] No write access to directory ${parentDir}:`, accessError);
                throw new Error(`No write access to config directory: ${accessError.message}`);
            }

            // Convert config to string first to catch any JSON serialization errors
            let configString;
            try {
                configString = JSON.stringify(config, null, 2);
                logger.debug(`[VC-CONFIG] Successfully stringified config`);
            } catch (stringifyError) {
                logger.error(`[VC-CONFIG] Failed to stringify config:`, stringifyError);
                throw new Error(`Invalid configuration data: ${stringifyError.message}`);
            }

            // Try to write the file
            logger.debug(`[VC-CONFIG] Writing config to ${configPath}`);
            await fs.writeFile(configPath, configString, 'utf8');
            logger.info(`[VC-CONFIG] Successfully saved config for guild ${guildId}`);
            
            // Verify the file was written
            try {
                const stats = await fs.stat(configPath);
                logger.debug(`[VC-CONFIG] Config file verified, size: ${stats.size} bytes`);
                
                // Read back the file to verify contents
                const fileContent = await fs.readFile(configPath, 'utf8');
                const parsedContent = JSON.parse(fileContent);
                logger.debug(`[VC-CONFIG] Verified config contents:`, {
                    hasChannelRoles: !!parsedContent.channelRoles,
                    channelRolesCount: parsedContent.channelRoles ? Object.keys(parsedContent.channelRoles).length : 0
                });
            } catch (verifyError) {
                logger.error(`[VC-CONFIG] Failed to verify config file after write:`, verifyError);
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
