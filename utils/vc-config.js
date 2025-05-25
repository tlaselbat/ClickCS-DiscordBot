/**
 * Configuration handler for VC settings
 * @module utils/vc-config
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

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
     * @throws {Error} If config directory cannot be created
     */
    constructor(configDir) {
        this.configDir = configDir;
        this.defaultConfig = {
            channelAccessEnabled: false,
            channelId: null,
            roleAssignmentEnabled: false,
            roleId: null
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
        return path.join(this.configDir, `${guildId}.json`);
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
    async saveVCConfig(guildId, config) {
        const configPath = this.getConfigPath(guildId);
        try {
            // Ensure parent directory exists
            const parentDir = path.dirname(configPath);
            if (!existsSync(parentDir)) {
                mkdirSync(parentDir, { recursive: true });
            }

            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
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

export default VCConfig;
