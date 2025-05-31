const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

// Get directory name in CommonJS
const __filename = __filename;
const __dirname = __dirname;

// Default presence configuration
const defaultPresenceConfig = {
    status: 'online',
    activities: [
        {
            name: 'with {users} users',
            type: 'PLAYING'
        },
        {
            name: 'v{version}',
            type: 'PLAYING'
        },
        {
            name: '{prefix}help',
            type: 'LISTENING'
        }
    ],
    statusMessages: [
        'Serving {guilds} servers with {users} users',
        'Version {version} | Prefix: {prefix}',
        'Type {prefix}help for commands'
    ],
    updateInterval: 120000,
    randomizeStatus: true,
    activitySettings: {
        showTimestamps: true,
        showServerCount: true,
        showUserCount: true
    }
};

class PresenceConfig {
    constructor() {
        this.config = { ...defaultPresenceConfig };
        this.configPath = path.join(process.cwd(), 'config', 'presence-config.json');
    }

    /**
     * Load presence configuration from file
     */
    async load() {
        logger.info('Loading presence configuration...');
        
        try {
            // Reset to defaults first
            this.config = JSON.parse(JSON.stringify(defaultPresenceConfig));
            
            // Check if config file exists
            try {
                await fs.access(this.configPath);
                logger.debug(`Presence config file found at: ${this.configPath}`);
                
                // Read and parse config file
                const fileContent = await fs.readFile(this.configPath, 'utf8');
                
                if (!fileContent.trim()) {
                    logger.warn('Presence config file is empty, using defaults');
                    return;
                }
                
                const fileConfig = JSON.parse(fileContent);
                
                // Merge with defaults
                this.config = {
                    ...this.config,
                    ...fileConfig,
                    activities: fileConfig.activities || this.config.activities,
                    statusMessages: fileConfig.statusMessages || this.config.statusMessages,
                    activitySettings: {
                        ...this.config.activitySettings,
                        ...(fileConfig.activitySettings || {})
                    }
                };
                
                logger.info('Presence configuration loaded successfully');
                
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // File doesn't exist, create it with defaults
                    logger.warn('Presence config file not found, creating default...');
                    await this.save();
                } else {
                    logger.error('Error loading presence config:', error);
                    throw error;
                }
            }
        } catch (error) {
            logger.error('Failed to load presence configuration:', error);
            throw error;
        }
    }
    
    /**
     * Save current presence configuration to file
     */
    async save() {
        try {
            // Ensure config directory exists
            const configDir = path.join(process.cwd(), 'config');
            await fs.mkdir(configDir, { recursive: true });
            
            // Write config to file with pretty print
            await fs.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
            
            logger.info(`Presence configuration saved to ${this.configPath}`);
            return true;
        } catch (error) {
            logger.error('Failed to save presence configuration:', error);
            throw error;
        }
    }
    
    /**
     * Get the presence configuration
     * @returns {Object} The presence configuration
     */
    getConfig() {
        return this.config;
    }
}

// Create a singleton instance
const presenceConfig = new PresenceConfig();

// Export the singleton instance and the class
module.exports = presenceConfig;
module.exports.PresenceConfig = PresenceConfig;
