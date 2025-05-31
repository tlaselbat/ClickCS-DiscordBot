const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');
const config = require('./config');

/**
 * Base error class for application-specific errors
 */
class AppError extends Error {
  /**
   * Create a new application error
   * @param {string} message - Error message
   * @param {string} [code] - Error code
   * @param {number} [statusCode=500] - HTTP status code
   * @param {Object} [details] - Additional error details
   */
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error
 */
class ValidationError extends AppError {
  /**
   * Create a new validation error
   * @param {string} message - Error message
   * @param {Object} [details] - Validation details
   */
  constructor(message = 'Validation failed', details = {}) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * Authentication error
 */
class AuthenticationError extends AppError {
  /**
   * Create a new authentication error
   * @param {string} [message='Authentication required'] - Error message
   */
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

/**
 * Authorization error
 */
class AuthorizationError extends AppError {
  /**
   * Create a new authorization error
   * @param {string} [message='Insufficient permissions'] - Error message
   */
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

/**
 * Not found error
 */
class NotFoundError extends AppError {
  /**
   * Create a new not found error
   * @param {string} [message='Resource not found'] - Error message
   * @param {string} [resource] - Resource that was not found
   * @param {string} [id] - ID of the resource that was not found
   */
  constructor(message = 'Resource not found', resource = null, id = null) {
    super(message, 'NOT_FOUND', 404, { resource, id });
  }
}

/**
 * Rate limit error
 */
class RateLimitError extends AppError {
  /**
   * Create a new rate limit error
   * @param {string} [message='Too many requests'] - Error message
   * @param {number} [retryAfter] - Time in seconds to wait before retrying
   */
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    if (retryAfter) {
      this.retryAfter = retryAfter;
      this.headers = { 'Retry-After': retryAfter };
    }
  }
}

/**
 * Handles errors and sends appropriate responses
 * @param {Error} error - The error to handle
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.logError=true] - Whether to log the error
 * @param {import('discord.js').BaseInteraction} [options.interaction] - Discord.js interaction object
 * @param {boolean} [options.ephemeral=true] - Whether to make the error response ephemeral
 * @returns {Promise<Object>} Error response object
 */
async function handleError(error, { 
  logError = true, 
  interaction = null,
  ephemeral = true,
} = {}) {
  // Default to internal server error
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details = {};
  let retryAfter;
  let headers = {};
  let userFacingMessage = '❌ An error occurred while processing your request.';

  // Handle known error types
  if (error instanceof AppError) {
    statusCode = error.statusCode || statusCode;
    code = error.code || code;
    message = error.message || message;
    details = error.details || details;
    retryAfter = error.retryAfter;
    headers = error.headers || headers;
    userFacingMessage = `❌ ${message}`;
  } else if (error.name === 'ValidationError') {
    // Handle Joi validation errors
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.details || {};
    userFacingMessage = '❌ Invalid input. Please check your request and try again.';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid or expired token';
    userFacingMessage = '🔑 Invalid or expired authentication. Please log in again.';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
    userFacingMessage = '⌛ Your session has expired. Please log in again.';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    code = 'FILE_TOO_LARGE';
    message = 'File size is too large';
    userFacingMessage = '📁 The file you tried to upload is too large.';
  } else if (error.code === 'ENOENT') {
    statusCode = 404;
    code = 'FILE_NOT_FOUND';
    message = 'File not found';
    userFacingMessage = '🔍 The requested resource was not found.';
  } else if (error.code === 'ECONNREFUSED') {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Service unavailable';
    userFacingMessage = '🔌 The service is currently unavailable. Please try again later.';
  } else if (error.code === 'ETIMEDOUT') {
    statusCode = 504;
    code = 'GATEWAY_TIMEOUT';
    message = 'Request timed out';
    userFacingMessage = '⏱️ The request timed out. Please try again.';
  } else if (error.code === 'ENOTFOUND') {
    statusCode = 502;
    code = 'BAD_GATEWAY';
    message = 'Service not available';
    userFacingMessage = '🌐 Unable to connect to the service. Please try again later.';
  } else if (error.code === 'InteractionAlreadyReplied') {
    // Discord.js specific error - interaction was already replied to
    statusCode = 400;
    code = 'INTERACTION_ALREADY_REPLIED';
    message = 'Interaction was already replied to';
    logError = false; // Don't log this as an error
  }

  // Log the error if needed
  if (logError) {
    const logContext = {
      code,
      statusCode,
      interaction: interaction ? {
        id: interaction.id,
        type: interaction.type,
        commandName: interaction.commandName,
        userId: interaction.user?.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      } : undefined,
      ...details,
    };

    if (statusCode >= 500) {
      logger.error(message, { error: error.stack || error.message, ...logContext });
    } else {
      logger.warn(message, logContext);
    }
  }

  // Send response to Discord interaction if available
  if (interaction && !interaction.replied && !interaction.deferred) {
    try {
      const embed = new EmbedBuilder()
        .setColor(0xED4245) // Red color for errors
        .setTitle('❌ Error')
        .setDescription(userFacingMessage)
        .setTimestamp();

      if (config.env === 'development' && error.stack) {
        const stack = error.stack.split('\n').slice(0, 3).join('\n');
        embed.addFields(
          { name: 'Error Details', value: `\`\`\`${stack}\`\`\``, inline: false }
        );
      }

      if (interaction.deferred) {
        await interaction.editReply({ 
          embeds: [embed],
          components: [],
          ephemeral 
        });
      } else if (interaction.isCommand() || interaction.isButton() || interaction.isSelectMenu()) {
        await interaction.reply({ 
          embeds: [embed],
          ephemeral,
          fetchReply: true 
        });
      }
    } catch (replyError) {
      logger.error('Failed to send error response to interaction', {
        error: replyError,
        interactionId: interaction.id,
        originalError: message,
      });
    }
  }

  // Return error response object
  return {
    success: false,
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 && { details }),
      ...(retryAfter && { retryAfter }),
    },
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...(retryAfter && { 'Retry-After': retryAfter }),
      ...headers,
    },
  };
}

/**
 * Wraps an async function with error handling
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn - Async function to wrap
 * @returns {(...args: any[]) => Promise<[Error, undefined] | [null, T]>} Wrapped function with error handling
 */
function asyncHandler(fn) {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return [null, result];
    } catch (error) {
      return [error, undefined];
    }
  };
}

/**
 * Creates an error handler middleware for Express
 * @returns {import('express').ErrorRequestHandler} Express error handler middleware
 */
function errorHandler() {
  return (err, req, res, next) => {
    const { error, statusCode, headers } = handleError(err, { 
      logError: true,
      interaction: req.interaction,
    });

    res.status(statusCode).set(headers).json(error);
  };
}

/**
 * Creates a wrapper for Discord.js interaction handlers with error handling
 * @template T
 * @param {(interaction: import('discord.js').BaseInteraction) => Promise<T>} handler - Interaction handler function
 * @param {Object} [options] - Options
 * @param {boolean} [options.ephemeral=true] - Whether to make error responses ephemeral
 * @returns {(interaction: import('discord.js').BaseInteraction) => Promise<T|void>} Wrapped handler with error handling
 */
function withInteractionErrorHandling(handler, { ephemeral = true } = {}) {
  return async (interaction) => {
    try {
      return await handler(interaction);
    } catch (error) {
      await handleError(error, { 
        interaction, 
        ephemeral,
      });
    }
  };
}

/**
 * Creates a wrapper for async route handlers with error handling
 * @template T
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<T>} handler - Async route handler
 * @returns {import('express').RequestHandler} Express request handler with error handling
 */
function asyncRouteHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      const { error: errorResponse, statusCode, headers } = handleError(error, { 
        logError: true,
      });
      
      res.status(statusCode).set(headers).json(errorResponse);
    }
  };
}
// Export all classes and functions
module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  handleError,
  asyncHandler,
  errorHandler,
  withInteractionErrorHandling,
  asyncRouteHandler
};
