const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const VCConfig = require('./vc-config');

// Paths
const paths = {
  configFile: path.join(process.cwd(), 'config', 'bot-config.json'),
  configDir: path.join(process.cwd(), 'config')
};

// Default configuration
const defaultConfig = {
  bot: {
    prefix: process.env.BOT_PREFIX || '!',
    version: '1.0.0',
    maxRetries: 3,
    retryDelay: 2000,
    presenceUpdateInterval: 120000,
    environment: process.env.NODE_ENV || 'development',
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.CLIENT_ID || '',
    guildId: process.env.GUILD_ID || ''
  },
  permissions: {
    adminRoles: [],
    moderatorRoles: [],
    ownerID: ''
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enabled: true,
    directory: './logs',
    file: 'bot.log',
    console: true
  }
};

class Config {
  constructor() {
    this.config = { ...defaultConfig };
    // Initialize VC config
    this.vcConfig = new VCConfig(path.join(process.cwd(), 'config'));
  }

  /**
   * Load configuration from file
   */
  async load() {
    console.log('\n🔧 Config: Starting configuration load...');
    
    try {
      // Reset to defaults first
      console.log('🔄 Config: Applying default configuration...');
      this.config = JSON.parse(JSON.stringify(defaultConfig));
      
      // If we have environment variables, override defaults
      console.log('🔍 Config: Checking for environment variables...');
      
      const envVars = [
        'DISCORD_TOKEN',
        'CLIENT_ID',
        'GUILD_ID',
        'NODE_ENV',
        'LOG_LEVEL'
      ];
      
      // Log found environment variables
      envVars.forEach(varName => {
        if (process.env[varName]) {
          const displayValue = varName.includes('TOKEN') ? '*** (exists)' : process.env[varName];
          console.log(`   ✓ ${varName}=${displayValue}`);
        } else {
          console.log(`   ✗ ${varName} not set`);
        }
      });
      
      // Apply environment variables to config
      if (process.env.DISCORD_TOKEN) {
        this.config.bot.token = process.env.DISCORD_TOKEN;
      }
      
      if (process.env.CLIENT_ID) {
        this.config.bot.clientId = process.env.CLIENT_ID;
      }
      
      if (process.env.GUILD_ID) {
        this.config.bot.guildId = process.env.GUILD_ID;
      }

      // Check if config file exists
      console.log('\n🔍 Config: Checking for config file...');
      try {
        await fs.access(paths.configFile);
        console.log(`✅ Config file found at: ${paths.configFile}`);
      } catch (error) {
        console.warn('⚠️  Config file not found, creating default config...');
        await this.save();
        console.log('✅ Created default config file');
        return;
      }

      // Read and parse config file
      const fileContent = await fs.readFile(paths.configFile, 'utf8');
      
      // Log first 200 characters for debugging
      logger.debug(`Config file preview: ${fileContent.substring(0, 200)}...`);
      
      try {
        // // Log the exact content for debugging
        // logger.debug('Raw config file content:', fileContent);
        
        // Check for common JSON issues
        const trimmedContent = fileContent.trim();
        if (!trimmedContent) {
          throw new Error('Config file is empty');
        }
        
        // Try to parse the JSON
        const fileConfig = JSON.parse(trimmedContent);
        
        // Log successful parse
        // logger.debug('Successfully parsed config:', JSON.stringify(fileConfig, null, 2));
        
        // Merge with defaults
        this.config = {
          ...this.config,
          ...fileConfig,
          // Ensure token from env takes precedence
          bot: {
            ...this.config.bot,
            ...(fileConfig.bot || {}),
            token: process.env.DISCORD_TOKEN || (fileConfig.bot?.token || '')
          }
        };
        
        logger.info('Configuration loaded successfully');
      } catch (parseError) {
        // Enhanced error logging
        logger.error('Failed to parse config file. Error details:', {
          message: parseError.message,
          stack: parseError.stack,
          contentLength: fileContent.length,
          first100Chars: fileContent.substring(0, 100),
          last100Chars: fileContent.length > 100 ? fileContent.substring(fileContent.length - 100) : ''
        });
        throw new Error(`Invalid configuration: ${parseError.message}`);
      }
      
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Save current configuration to file
   */
  async save() {
    try {
      // Ensure config directory exists
      await fs.mkdir(paths.configDir, { recursive: true });
      
      // Write config to file with pretty print
      await fs.writeFile(
        paths.configFile,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );
      
      logger.info(`Configuration saved to ${paths.configFile}`);
      return true;
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Get a configuration value by dot notation
   * @param {string} key - Dot notation path to the config value
   * @param {*} defaultValue - Default value if key is not found
   * @returns {*}
   */
  get(key, defaultValue = undefined) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value === null || typeof value !== 'object' || !(k in value)) {
        return defaultValue;
      }
      value = value[k];
    }
    
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set a configuration value by dot notation
   * @param {string} key - Dot notation path to the config value
   * @param {*} value - Value to set
   * @returns {boolean} - True if successful
   */
  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj)) {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    const lastKey = keys[keys.length - 1];
    obj[lastKey] = value;
    return true;
  }

  /**
   * Get VC configuration for a guild
   * @param {string} guildId - The guild ID
   * @returns {Promise<Object>} The VC configuration
   */
  async getVCConfig(guildId) {
    return this.vcConfig.getVCConfig(guildId);
  }

  /**
   * Save VC configuration for a guild
   * @param {string} guildId - The guild ID
   * @param {Object} config - The configuration to save
   * @returns {Promise<void>}
   */
  async saveVCConfig(guildId, config) {
    return this.vcConfig.saveVCConfig(guildId, config);
  }
}

// Create and export a singleton instance
const config = new Config();

module.exports = config;
module.exports.config = config;
