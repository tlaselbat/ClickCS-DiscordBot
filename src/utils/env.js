const Joi = require('joi');
const { readFile } = require('fs').promises;
const { config: loadEnv } = require('dotenv');
const path = require('path');
const logger = require('./logger');

// Define the schema for environment variables
const envSchema = Joi.object({
  // Node Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
    
  // Server Configuration
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  
  // Discord Configuration
  DISCORD_TOKEN: Joi.string().required().description('Discord bot token'),
  CLIENT_ID: Joi.string().required().description('Discord client ID'),
  CLIENT_SECRET: Joi.string().description('Discord client secret (for OAuth2)'),
  GUILD_ID: Joi.string().description('Discord server ID for development'),
  
  // Application Configuration
  BOT_PREFIX: Joi.string().default('!').description('Default command prefix'),
  OWNER_IDS: Joi.string().description('Comma-separated list of bot owner user IDs'),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),
  
  // Database
  DATABASE_URL: Joi.string().uri().description('Database connection URL'),
  
  // API Keys
  SENTRY_DSN: Joi.string().uri().description('Sentry DSN for error tracking'),
  
  // Feature Flags
  ENABLE_SLASH_COMMANDS: Joi.boolean().default(true),
  ENABLE_MESSAGE_COMMANDS: Joi.boolean().default(true),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  
  // Caching
  CACHE_TTL: Joi.number().default(300000), // 5 minutes
  
  // Webhooks
  LOG_WEBHOOK_URL: Joi.string().uri().description('Discord webhook URL for logging'),
  ERROR_WEBHOOK_URL: Joi.string().uri().description('Discord webhook URL for errors'),
  
  // Security
  CORS_ORIGIN: Joi.string().default('*'),
  TRUST_PROXY: Joi.boolean().default(false),
  
  // Session
  SESSION_SECRET: Joi.string().min(32).description('Secret for session encryption'),
  SESSION_COOKIE_NAME: Joi.string().default('discord_bot_session'),
  SESSION_COOKIE_SECURE: Joi.boolean().default(process.env.NODE_ENV === 'production'),
  
  // Cache
  REDIS_URL: Joi.string().uri().description('Redis connection URL'),
  
  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().port().default(9090),
  
  // External Services
  API_BASE_URL: Joi.string().uri().description('Base URL for external API'),
  
  // Debugging
  DEBUG: Joi.boolean().default(false),
})
  .unknown() // Allow unknown environment variables
  .required();

/**
 * Load and validate environment variables
 * @returns {Promise<Object>} Validated environment variables
 */
async function loadEnvVars() {
  try {
    // Load environment variables from .env file if it exists
    loadEnv();
    
    // Parse environment variables
    const envVars = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      HOST: process.env.HOST,
      DISCORD_TOKEN: process.env.DISCORD_TOKEN,
      CLIENT_ID: process.env.CLIENT_ID,
      CLIENT_SECRET: process.env.CLIENT_SECRET,
      GUILD_ID: process.env.GUILD_ID,
      BOT_PREFIX: process.env.BOT_PREFIX,
      OWNER_IDS: process.env.OWNER_IDS,
      LOG_LEVEL: process.env.LOG_LEVEL,
      DATABASE_URL: process.env.DATABASE_URL,
      SENTRY_DSN: process.env.SENTRY_DSN,
      ENABLE_SLASH_COMMANDS: process.env.ENABLE_SLASH_COMMANDS,
      ENABLE_MESSAGE_COMMANDS: process.env.ENABLE_MESSAGE_COMMANDS,
      RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
      CACHE_TTL: process.env.CACHE_TTL,
      LOG_WEBHOOK_URL: process.env.LOG_WEBHOOK_URL,
      ERROR_WEBHOOK_URL: process.env.ERROR_WEBHOOK_URL,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
      TRUST_PROXY: process.env.TRUST_PROXY,
      SESSION_SECRET: process.env.SESSION_SECRET,
      SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
      SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
      REDIS_URL: process.env.REDIS_URL,
      ENABLE_METRICS: process.env.ENABLE_METRICS,
      METRICS_PORT: process.env.METRICS_PORT,
      API_BASE_URL: process.env.API_BASE_URL,
      DEBUG: process.env.DEBUG,
    };
    
    // Validate against schema
    const { value: validatedEnvVars, error } = envSchema.validate(envVars, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });
    
    if (error) {
      const validationError = new Error('Environment variables validation failed');
      validationError.details = error.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
      }));
      throw validationError;
    }
    
    // Process any complex values
    if (validatedEnvVars.OWNER_IDS) {
      validatedEnvVars.OWNER_IDS = validatedEnvVars.OWNER_IDS
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
    } else {
      validatedEnvVars.OWNER_IDS = [];
    }
    
    // Set default values for development
    if (validatedEnvVars.NODE_ENV === 'development') {
      validatedEnvVars.DEBUG = true;
      if (!validatedEnvVars.LOG_LEVEL) {
        validatedEnvVars.LOG_LEVEL = 'debug';
      }
    }
    
    // Set default values for production
    if (validatedEnvVars.NODE_ENV === 'production') {
      if (!validatedEnvVars.SESSION_SECRET) {
        throw new Error('SESSION_SECRET is required in production');
      }
      validatedEnvVars.SESSION_COOKIE_SECURE = true;
    }
    
    return validatedEnvVars;
  } catch (error) {
    logger.error('Failed to load environment variables', { error });
    throw error;
  }
}

// Load environment variables
let env = {};

// Use IIFE to handle async loading of env vars
(async () => {
  try {
    Object.assign(env, await loadEnvVars());
    logger.info(`Environment: ${env.NODE_ENV}`);
  } catch (error) {
    logger.error('Failed to load environment variables:', error);
    process.exit(1);
  }
})();

// Function to get environment variables
function getEnv(key, defaultValue = undefined) {
  const value = env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value !== undefined ? value : defaultValue;
}

// Function to check if we're in development mode
function isDev() {
  return env.NODE_ENV === 'development';
}

// Function to check if we're in production mode
function isProd() {
  return env.NODE_ENV === 'production';
}

// Function to check if we're in test mode
function isTest() {
  return env.NODE_ENV === 'test';
}

// Function to get the current environment
function getEnvName() {
  return env.NODE_ENV;
}

// Export all functions and the env object
module.exports = {
  env,
  loadEnvVars,
  getEnv,
  isDev,
  isProd,
  isTest,
  getEnvName
};
