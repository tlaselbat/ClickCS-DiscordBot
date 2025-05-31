/**
 * Unified Logger Utility
 * A comprehensive logging solution for the application
 * @module utils/logger
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const { format } = require('util');

// Avoid circular dependencies by not importing config directly
const CONFIG = {
    logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
    logLevel: process.env.LOG_LEVEL || 'info',
    env: process.env.NODE_ENV || 'development'
};



// Default log directory if config is not available yet
const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs');

/**
 * Log levels (syslog levels):
 * emergency: 0, alert: 1, crit: 2, error: 3, warning: 4, notice: 5, info: 6, debug: 7
 * 
 * winston levels (default):
 * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
 */

// Custom format for console output
const consoleFormat = winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
  const ts = timestamp.slice(0, 19).replace('T', ' ');
  let msg = `${ts} [${level}]: ${message}`;
  
  if (stack) {
    msg += `\n${stack}`;
  }
  
  if (Object.keys(meta).length > 0) {
    try {
      const metaStr = JSON.stringify(meta, null, 2);
      msg += `\n${metaStr}`;
    } catch (e) {
      msg += `\n${format(meta)}`;
    }
  }
  
  return msg;
});

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Logger class that provides a unified logging interface
 */
class Logger {
  constructor() {
    this.logger = null;
    this.initialized = false;
    this.initializePromise = this.initialize();
    this.queue = [];
  }

  /**
   * Initialize the logger with transports and configurations
   * @private
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Ensure logs directory exists
      try {
        await fs.mkdir(CONFIG.logDir, { recursive: true });
        console.log(`📁 Logs directory: ${CONFIG.logDir}`);
      } catch (err) {
        console.error(`❌ Failed to create logs directory: ${err.message}`);
        // Continue with just console logging
      }

      // Configure log level
      const level = CONFIG.logLevel;
      console.log(`📝 Log level set to: ${level}`);
      const maxFiles = 14; // Keep logs for 2 weeks by default
      const maxSize = 10 * 1024 * 1024; // 10MB per file

      // Configure transports
      const transports = [
        // Error logs (errors only)
        new winston.transports.File({
          filename: path.join(CONFIG.logDir, 'error.log'),
          level: 'error',
          maxsize: maxSize,
          maxFiles: maxFiles,
          tailable: true,
          zippedArchive: true,
          format: fileFormat,
        }),
        // Combined logs (all levels)
        new winston.transports.File({
          filename: path.join(CONFIG.logDir, 'combined.log'),
          maxsize: maxSize,
          maxFiles: maxFiles,
          tailable: true,
          zippedArchive: true,
          format: fileFormat,
        }),
      ];

      // Always add console logging in development, or if explicitly enabled
      const enableConsole = CONFIG.env !== 'production' || process.env.ENABLE_CONSOLE_LOGGING === 'true';
      if (enableConsole) {
        transports.push(
          new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.timestamp({ format: 'HH:mm:ss' }),
              winston.format.errors({ stack: true }),
              winston.format.splat(),
              consoleFormat
            ),
          })
        );
      }

      // Create the logger instance with consistent levels
      this.logger = winston.createLogger({
        level: level,
        // Using winston's default levels for consistency
        levels: winston.config.npm.levels,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.splat(),
          winston.format.json()
        ),
        transports: transports,
        exitOnError: false, // Don't exit on handled exceptions
      });

      // Process any queued logs
      this.processQueue();
      this.initialized = true;

      // Log successful initialization
      console.log('✅ Logger initialized successfully');
      this.logger.info('Logger initialized', { 
        level,
        logDir: CONFIG.logDir,
        env: CONFIG.env 
      });
    } catch (error) {
      console.error('Failed to initialize logger:', error);
      // Fallback to console if logger initialization fails
      this.logger = {
        log: (level, ...args) => console[level]?.(...args) || console.log(level, ...args),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console),
        http: console.debug.bind(console, '[http]'),
        verbose: console.debug.bind(console, '[verbose]'),
        debug: console.debug.bind(console, '[debug]'),
        silly: console.debug.bind(console, '[silly]'),
      };
      this.initialized = true;
    }
  }

  /**
   * Process any queued log messages
   * @private
   */
  processQueue() {
    while (this.queue.length > 0) {
      const { level, message, meta } = this.queue.shift();
      this.log(level, message, meta);
    }
  }

  /**
   * Log a message with the specified level
   * @param {string} level - The log level
   * @param {string} message - The message to log
   * @param {Object} [meta] - Additional metadata
   */
  log(level, message, meta = {}) {
    if (!this.initialized) {
      this.queue.push({ level, message, meta });
      return;
    }

    if (typeof message === 'object' && message !== null) {
      meta = { ...message, ...(meta || {}) };
      message = meta.message || JSON.stringify(message);
      delete meta.message;
    }

    if (this.logger) {
      this.logger.log(level, message, meta);
    } else {
      // Fallback to console if logger is not available
      const logFn = console[level] || console.log;
      logFn(`[${level.toUpperCase()}]`, message, meta || '');
    }
  }

  /**
   * Log an error message
   * @param {string} message - The error message
   * @param {Error|Object} [error] - The error object or additional metadata
   */
  error(message, error) {
    if (error instanceof Error) {
      this.log('error', message, { 
        error: error.message, 
        stack: error.stack,
        ...(error.cause && { cause: error.cause }),
        ...(error.code && { code: error.code })
      });
    } else {
      this.log('error', message, error);
    }
  }

  /**
   * Log a warning message
   * @param {string} message - The warning message
   * @param {Object} [meta] - Additional metadata
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  /**
   * Log an info message
   * @param {string} message - The info message
   * @param {Object} [meta] - Additional metadata
   */
  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  /**
   * Log an HTTP request
   * @param {string} message - The HTTP message
   * @param {Object} [meta] - Additional metadata
   */
  http(message, meta = {}) {
    this.log('http', message, meta);
  }

  /**
   * Log a verbose message
   * @param {string} message - The verbose message
   * @param {Object} [meta] - Additional metadata
   */
  verbose(message, meta = {}) {
    this.log('verbose', message, meta);
  }

  /**
   * Log a debug message
   * @param {string} message - The debug message
   * @param {Object} [meta] - Additional metadata
   */
  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  /**
   * Log a silly message
   * @param {string} message - The silly message
   * @param {Object} [meta] - Additional metadata
   */
  silly(message, meta = {}) {
    this.log('silly', message, meta);
  }

  /**
   * Create a child logger with additional metadata
   * @param {Object} meta - Metadata to include in all logs from this child
   * @returns {Object} A child logger instance
   */
  child(meta) {
    const childLogger = new Logger();
    childLogger.initializePromise = this.initializePromise.then(() => ({
      log: (level, message, childMeta) =>
        this.log(level, message, { ...childMeta, ...meta }),
      error: (message, error) =>
        this.error(message, error ? { ...error, ...meta } : meta),
      warn: (message, childMeta) =>
        this.warn(message, { ...childMeta, ...meta }),
      info: (message, childMeta) =>
        this.info(message, { ...childMeta, ...meta }),
      http: (message, childMeta) =>
        this.http(message, { ...childMeta, ...meta }),
      verbose: (message, childMeta) =>
        this.verbose(message, { ...childMeta, ...meta }),
      debug: (message, childMeta) =>
        this.debug(message, { ...childMeta, ...meta }),
      silly: (message, childMeta) =>
        this.silly(message, { ...childMeta, ...meta }),
      child: (childMeta) => this.child({ ...meta, ...childMeta }),
    }));
    return childLogger;
  }
}

// Create a singleton instance
const logger = new Logger();

// Create a proxy to ensure methods are only called after initialization
const loggerProxy = new Proxy({}, {
  get(_, prop) {
    return async (...args) => {
      await logger.initializePromise;
      return logger[prop](...args);
    };
  }
});

// Export the logger instance
module.exports = loggerProxy;
module.exports.logger = logger;
