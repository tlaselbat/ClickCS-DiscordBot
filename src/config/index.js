const path = require('path');
const { readFile } = require('fs').promises;
const { config: dotenvConfig } = require('dotenv');
const Joi = require('joi');
const { botConfigSchema, defaultConfig } = require('./schema');

/**
 * Loads and validates configuration from file and environment variables
 * @returns {Promise<Object>} Validated configuration object
 * @throws {Error} If configuration is invalid
 */
async function loadConfig() {
  try {
    // Load environment variables
    dotenvConfig();

    // Load config file
    const configPath = path.join(process.cwd(), 'config', 'bot-config.json');
    const configData = await readFile(configPath, 'utf8');
    const configJson = JSON.parse(configData);

    // Merge with defaults
    const mergedConfig = deepMerge(defaultConfig, configJson);

    // Validate against schema
    const { error, value: validatedConfig } = botConfigSchema.validate(mergedConfig, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
    });

    if (error) {
      const validationError = new Error('Configuration validation failed');
      validationError.details = error.details.map(detail => ({
        message: detail.message,
        path: detail.path.join('.'),
        type: detail.type,
      }));
      throw validationError;
    }

    // Override with environment variables if present
    if (process.env.DISCORD_TOKEN || process.env.BOT_TOKEN) {
      validatedConfig.bot.token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
    }
    if (process.env.BOT_PREFIX) {
      validatedConfig.bot.prefix = process.env.BOT_PREFIX;
    }
    
    // Ensure we have a token
    if (!validatedConfig.bot.token) {
      throw new Error('No bot token provided. Please set DISCORD_TOKEN in your .env file');
    }
    if (process.env.NODE_ENV) {
      validatedConfig.bot.environment = process.env.NODE_ENV;
    }

    return validatedConfig;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Configuration file not found at ${error.path}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * Check if value is a plain object
 * @param {*} item - Value to check
 * @returns {boolean} True if value is a plain object
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Export a singleton instance of the config
let configInstance;

async function getConfig() {
  if (!configInstance) {
    configInstance = await loadConfig();
  }
  return configInstance;
}

module.exports = {
  getConfig,
  loadConfig,
};
