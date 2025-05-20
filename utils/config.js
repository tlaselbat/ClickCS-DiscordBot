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
        this.config = null;
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
            const configContent = await fs.readFile(configPath, 'utf-8');
            this.config = JSON.parse(configContent);

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
     */
    get(path) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        return path.split('.').reduce((obj, key) => obj && obj[key], this.config);
    }

    /**
     * Set a configuration value
     * @param {string} path - Path to the configuration value
     * @param {*} value - The new value
     * @returns {void}
     */
    set(path, value) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.config;

        for (const key of keys) {
            obj = obj[key] = obj[key] || {};
        }

        obj[lastKey] = value;
    }
}

// Export singleton instance
const instance = new Config();
module.exports = instance;
