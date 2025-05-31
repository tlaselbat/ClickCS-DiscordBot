const logger = require('./logger');

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
 * Database error
 */
class DatabaseError extends AppError {
  /**
   * Create a new database error
   * @param {string} [message='Database operation failed'] - Error message
   * @param {Object} [details] - Database error details
   */
  constructor(message = 'Database operation failed', details = {}) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}

/**
 * Handles errors and sends appropriate responses
 * @param {Error} error - The error to handle
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.logError=true] - Whether to log the error
 * @returns {Object} Error response object
 */
function handleError(error, { logError = true } = {}) {
  // Default to internal server error
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details = {};
  let retryAfter;
  let headers = {};

  // Handle known error types
  if (error instanceof AppError) {
    statusCode = error.statusCode || statusCode;
    code = error.code || code;
    message = error.message || message;
    details = error.details || details;
    retryAfter = error.retryAfter;
    headers = error.headers || headers;
  } else if (error.name === 'ValidationError') {
    // Handle Joi validation errors
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.details || {};
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid or expired token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
  } else if (error.code === '23505') {
    // PostgreSQL unique violation
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Resource already exists';
    details = { constraint: error.constraint };
  } else if (error.code === '23503') {
    // PostgreSQL foreign key violation
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced resource not found';
    details = { constraint: error.constraint };
  }

  // Log the error if needed
  if (logError) {
    const logContext = {
      code,
      statusCode,
      stack: error.stack,
      ...details,
    };

    if (statusCode >= 500) {
      logger.error(message, error, logContext);
    } else {
      logger.warn(message, logContext);
    }
  }

  // Prepare error response
  const response = {
    success: false,
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 && { details }),
    },
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...(retryAfter && { 'Retry-After': retryAfter }),
      ...headers,
    },
    body: JSON.stringify(response),
  };
}

/**
 * Wraps an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function with error handling
 */
function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      const { statusCode, headers, body } = handleError(error);
      res.status(statusCode).set(headers).send(body);
    }
  };
}

/**
 * Creates an error handler middleware
 * @returns {Function} Express error handler middleware
 */
function errorHandler() {
  return (error, req, res, next) => {
    const { statusCode, headers, body } = handleError(error);
    res.status(statusCode).set(headers).send(body);
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
  DatabaseError,
  handleError,
  asyncHandler,
  errorHandler
};
