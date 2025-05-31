const Joi = require('joi');

/**
 * Schema for validating bot configuration
 */
const botConfigSchema = Joi.object({
  bot: Joi.object({
    token: Joi.string().optional().description('Discord bot token (can also be provided via DISCORD_TOKEN env var)'),
    prefix: Joi.string().default('/').description('Command prefix'),
    version: Joi.string().default('1.0.0').description('Bot version'),
    maxRetries: Joi.number().default(3).description('Maximum retry attempts for operations'),
    retryDelay: Joi.number().default(2000).description('Delay between retries in ms'),
    presenceUpdateInterval: Joi.number().default(120000).description('Presence update interval in ms'),
    environment: Joi.string()
      .valid('development', 'testing', 'production')
      .default('development')
      .description('Runtime environment'),
  }).required(),
  
  permissions: Joi.object({
    ownerID: Joi.string().required().description('Bot owner user ID'),
    adminRoles: Joi.array().items(Joi.string()).default([]).description('Role IDs with admin permissions'),
    moderatorRoles: Joi.array().items(Joi.string()).default([]).description('Role IDs with moderator permissions'),
  }).required(),
  
  roles: Joi.object({
    voiceChannel: Joi.object({
      name: Joi.string().default('vc').description('Voice channel role name'),
      color: Joi.string().default('#00ff00').description('Voice channel role color'),
      mentionable: Joi.boolean().default(true).description('Whether the role is mentionable'),
      enabled: Joi.boolean().default(true).description('Whether voice channel role management is enabled'),
      autoRemove: Joi.boolean().default(true).description('Automatically remove role when leaving voice')
    }).default(),
  }).default(),
  
  events: Joi.object({
    voiceStateUpdate: Joi.object({
      enabled: Joi.boolean().default(true).description('Enable voice state update handling'),
      debug: Joi.boolean().default(false).description('Enable debug logging for voice state updates'),
    }).default(),
  }).default(),
  
  logging: Joi.object({
    level: Joi.string()
      .valid('error', 'warn', 'info', 'debug', 'trace')
      .default('info')
      .description('Logging level'),
    file: Joi.string().default('logs/combined.log').description('Log file path'),
    errorFile: Joi.string().default('logs/error.log').description('Error log file path'),
    maxSize: Joi.string().default('20m').description('Maximum log file size'),
    maxFiles: Joi.number().default(14).description('Maximum number of log files to keep'),
  }).default(),
  
  api: Joi.object({
    enabled: Joi.boolean().default(false).description('Enable REST API'),
    port: Joi.number().default(3000).description('API server port'),
    cors: Joi.string().default('*').description('CORS allowed origins'),
    rateLimit: Joi.object({
      windowMs: Joi.number().default(15 * 60 * 1000).description('Rate limit window in ms'),
      max: Joi.number().default(100).description('Max requests per window'),
    }).default(),
  }).default(),
}).required();

/**
 * Default configuration values
 */
const defaultConfig = {
  bot: {
    prefix: '/',
    version: '1.0.0',
    maxRetries: 3,
    retryDelay: 2000,
    presenceUpdateInterval: 120000,
    environment: 'development',
  },
  permissions: {
    ownerID: '',
    adminRoles: [],
    moderatorRoles: [],
  },
  roles: {
    voiceChannel: {
      name: 'vc',
      color: '#00ff00',
      mentionable: true,
      enabled: true,
      autoRemove: true,
      blacklist: {
        enabled: true,
        adminBlacklisted: true,
        users: [],
      },
    },
  },
  events: {
    voiceStateUpdate: {
      enabled: true,
      debug: false,
    },
  },
  logging: {
    level: 'info',
    file: 'logs/combined.log',
    errorFile: 'logs/error.log',
    maxSize: '20m',
    maxFiles: 14,
  },
  api: {
    enabled: false,
    port: 3000,
    cors: '*',
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },
};

module.exports = {
  botConfigSchema,
  defaultConfig
};
