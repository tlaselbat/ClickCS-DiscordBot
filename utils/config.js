/**
 * Configuration loader utility
 * @module utils/config
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Configuration class for managing bot settings
 */
class Config {
    /**
     * Creates a new Config instance
     */
    constructor() {
        this.config = {
            bot: {
                prefix: "!",
                defaultStatus: "with Discord",
                version: "1.0.0",
                maxRetries: 3,
                retryDelay: 2000
            },
            permissions: {
                ownerID: ""
            },
            roles: {
                voiceChannel: {
                    name: 'vc',
                    color: "#00ff00",
                    mentionable: true
                }
            },
            logging: {
                level: "info",
                file: {
                    maxSize: "5MB",
                    maxFiles: 5
                }
            },
            database: {
                enabled: false,
                type: "sqlite",
                path: "./data/bot.db"
            },
            ratelimits: {
                commands: {
                    default: {
                        cooldown: 3000,
                        maxUses: 5
                    }
                }
            },
            auth: {
                token: process.env.DISCORD_TOKEN
            },
            activity: {
                name: "on servers",
                type: "WATCHING"
            }
        };
        
        // Load from file if it exists
        this.load().catch(error => {
            logger.error('Error loading configuration:', {
                error: error.message,
                stack: error.stack
            });
        });;
    }

    /**
     * Load configuration from file
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If config loading fails
     */
    async load() {
        try {
            const configPath = path.join(__dirname, '../config/bot-config.json');
            
            // Try to load config file
            let configContent;
            try {
                configContent = await fs.readFile(configPath, 'utf-8');
                const fileConfig = JSON.parse(configContent);
                
                // Merge file config with default config
                this.config = {
                    ...this.config,
                    ...fileConfig,
                    auth: {
                        token: process.env.DISCORD_TOKEN || fileConfig.auth?.token
                    }
                };
            } catch (error) {
                // If file doesn't exist, create it with default config
                if (error.code === 'ENOENT') {
                    logger.warn('Config file not found, creating with default values');
                    await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
                } else {
                    throw error;
                }
            }

            // Validate required fields
            if (!this.config.bot?.prefix) {
                throw new Error('Bot prefix is required in configuration');
            }
            if (!this.config.permissions?.ownerID) {
                throw new Error('Owner ID is required in configuration');
            }

            logger.info('Configuration loaded successfully');
            return this.config;
        } catch (error) {
            logger.error('Error loading configuration:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get a configuration value
     * @param {string} path - Path to the configuration value (e.g., 'bot.prefix')
     * @returns {*} The configuration value
     * @throws {Error} If configuration is not loaded or path is invalid
     */
    get(path) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value[key] === undefined) {
                throw new Error(`Configuration path '${path}' not found`);
            }
            value = value[key];
        }

        return value;
    }

    /**
     * Get nested configuration object
     * @param {string} path - Path to the configuration object (e.g., 'bot')
     * @returns {Object} The nested configuration object
     */
    getSection(path) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value[key] === undefined) {
                throw new Error(`Configuration path '${path}' not found`);
            }
            value = value[key];
        }

        return value;
    }

    /**
     * Get default configuration
     * @returns {Object} Default configuration object
     */
    getDefaultConfig() {
        return this.defaultConfig;
    }
}

// Export singleton instance
const instance = new Config();
module.exports = instance;
