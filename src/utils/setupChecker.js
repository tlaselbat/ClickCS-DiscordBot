const { join } = require('path');
const { access, constants, mkdir } = require('fs').promises;
const { existsSync } = require('fs');
const logger = require('./logger');

const __filename = __filename;
const __dirname = __dirname;
const CONFIG_DIR = join(process.cwd(), 'config');

class SetupChecker {
  /**
   * Run all setup checks
   * @returns {Promise<{success: boolean, errors: string[]}>}
   */
  static async runChecks() {
    const errors = [];
    
    try {
      // Check environment variables
      await this.checkEnvironmentVariables();
      
      // Check config directory and files
      await this.checkConfigFiles();
      
      // Check required directories
      await this.checkRequiredDirectories();
      
      // Check file permissions
      await this.checkFilePermissions();
      
      logger.info('✅ All setup checks passed');
      return { success: true, errors: [] };
    } catch (error) {
      errors.push(error.message);
      logger.error('❌ Setup check failed:', error);
      return { success: false, errors };
    }
  }
  
  /**
   * Check required environment variables
   */
  static async checkEnvironmentVariables() {
    const requiredVars = [
      'DISCORD_TOKEN',
      'CLIENT_ID',
      'GUILD_ID'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    logger.debug('Environment variables check passed');
  }
  
  /**
   * Check if required config files exist and are accessible
   */
  static async checkConfigFiles() {
    const requiredFiles = [
      'bot-config.json',
      'voice-channel-config.json',
      'presence-config.json'
    ];
    
    for (const file of requiredFiles) {
      const filePath = join(CONFIG_DIR, file);
      try {
        await access(filePath, constants.R_OK);
        logger.debug(`Config file accessible: ${file}`);
      } catch (error) {
        logger.warn(`Config file not accessible: ${file} - ${error.message}. Creating a default one...`);
        
        // Create a default config file if it doesn't exist
        try {
          let defaultContent = '{}';
          if (file === 'bot-config.json') {
            defaultContent = JSON.stringify({
              bot: {
                prefix: '!',
                version: '1.0.0',
                maxRetries: 3,
                retryDelay: 2000,
                presenceUpdateInterval: 120000,
                environment: process.env.NODE_ENV || 'development'
              }
            }, null, 2);
          } else if (file === 'voice-channel-config.json') {
            defaultContent = JSON.stringify({
              enabled: true,
              channelRoles: {}
            }, null, 2);
          } else if (file === 'presence-config.json') {
            defaultContent = JSON.stringify({
              status: 'online',
              activities: [
                { name: 'with Discord.js', type: 'PLAYING' },
                { name: '!help', type: 'LISTENING' }
              ]
            }, null, 2);
          }
          
          await fs.writeFile(filePath, defaultContent, 'utf8');
          logger.info(`Created default ${file} with default settings`);
        } catch (writeError) {
          logger.error(`Failed to create default ${file}:`, writeError);
          // Only throw error in production
          if (process.env.NODE_ENV === 'production') {
            throw new Error(`Config file not accessible and could not create default: ${file}`);
          }
        }
      }
    }
  }
  
  /**
   * Check and create required directories
   */
  static async checkRequiredDirectories() {
    const requiredDirs = [
      join(process.cwd(), 'logs'),
      join(process.cwd(), 'data')
    ];
    
    for (const dir of requiredDirs) {
      try {
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
          logger.debug(`Created directory: ${dir}`);
        }
      } catch (error) {
        throw new Error(`Failed to create directory ${dir}: ${error.message}`);
      }
    }
  }
  
  /**
   * Check file permissions for required files
   */
  static async checkFilePermissions() {
    const filesToCheck = [
      join(CONFIG_DIR, 'bot-config.json'),
      join(CONFIG_DIR, 'voice-channel-config.json')
    ];
    
    for (const file of filesToCheck) {
      try {
        await access(file, constants.R_OK);
        logger.debug(`File is readable: ${file}`);
        
        // Only check write permissions in production
        if (process.env.NODE_ENV === 'production') {
          await access(file, constants.W_OK);
          logger.debug(`File is writable: ${file}`);
        }
      } catch (error) {
        logger.warn(`Insufficient permissions for file: ${file} - ${error.message}`);
        // Only throw error in production
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Insufficient permissions for file: ${file}`);
        }
      }
    }
  }
}

module.exports = SetupChecker;
