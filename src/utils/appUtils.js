const { logger } = require('./logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * Validates the application configuration
 * @throws {Error} If configuration is invalid
 */
async function validateConfiguration() {
    try {
        // Check required environment variables
        const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }
        
        // Validate presence config if it exists
        const presenceConfigPath = path.join(process.cwd(), 'config', 'presence-config.json');
        try {
            await fs.access(presenceConfigPath);
            const presenceConfigData = await fs.readFile(presenceConfigPath, 'utf8');
            const presenceConfig = JSON.parse(presenceConfigData);
            
            // Basic validation of presence config
            if (!presenceConfig.activities || !Array.isArray(presenceConfig.activities)) {
                throw new Error('Invalid presence config: activities must be an array');
            }
            
            logger.info('✅ Presence configuration validated successfully');
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('No presence config found, using default presence');
            } else {
                logger.warn(`Invalid presence config: ${error.message}`);
            }
        }
        
        logger.info('✅ Configuration validated successfully');
    } catch (error) {
        logger.error('Configuration validation failed:', error);
        throw error;
    }
}

/**
 * Formats an error object for logging
 * @param {Error|any} error - The error to format
 * @returns {Object} Formatted error details
 */
function formatError(error) {
    if (!(error instanceof Error)) {
        return { message: String(error) };
    }
    
    const formatted = {
        message: error.message,
        name: error.name,
        stack: error.stack,
    };
    
    // Include additional error properties if they exist
    Object.getOwnPropertyNames(error).forEach(key => {
        if (!formatted[key]) {
            formatted[key] = error[key];
        }
    });
    
    return formatted;
}

/**
 * Creates a promise that resolves after a delay
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<void>}
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
            logger.info(`Created directory: ${dirPath}`);
        } else {
            throw error;
        }
    }
}

/**
 * Safely parses JSON from a file
 * @param {string} filePath - Path to the JSON file
 * @param {*} [defaultValue=null] - Default value if file doesn't exist or is invalid
 * @returns {Promise<*>} Parsed JSON or default value
 */
async function safeJsonParse(filePath, defaultValue = null) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.debug(`File not found: ${filePath}, using default value`);
        } else {
            logger.warn(`Error parsing JSON from ${filePath}:`, error);
        }
        return defaultValue;
    }
}

module.exports = {
  validateConfiguration,
  formatError,
  delay,
  ensureDirectoryExists,
  safeJsonParse
};
