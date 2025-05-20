/**
 * Logger utility using Winston
 * @module utils/logger
 */

const winston = require('winston');
const { format } = winston;
const path = require('path');

// Configure Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(__dirname, '../error.log'),
            level: 'error',
            maxFiles: 5,
            maxsize: 5242880 // 5MB
        }),
        new winston.transports.File({
            filename: path.join(__dirname, '../combined.log'),
            maxFiles: 5,
            maxsize: 5242880 // 5MB
        })
    ],
    exceptionHandlers: [
        new winston.transports.File({ filename: path.join(__dirname, '../exceptions.log') })
    ],
    exitOnError: false
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple()
        )
    }));
}

// Add custom error handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        error: error.message,
        stack: error.stack,
        date: new Date().toISOString()
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
        reason: reason?.message || reason,
        promise: promise,
        date: new Date().toISOString()
    });
});

/**
 * Logger instance with additional utility methods
 */
class Logger {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Log an info message
     * @param {string} message - The message to log
     * @param {Object} [meta] - Additional metadata
     */
    info(message, meta = {}) {
        this.logger.info(message, { ...meta, timestamp: new Date().toISOString() });
    }

    /**
     * Log a warning message
     * @param {string} message - The message to log
     * @param {Object} [meta] - Additional metadata
     */
    warn(message, meta = {}) {
        this.logger.warn(message, { ...meta, timestamp: new Date().toISOString() });
    }

    /**
     * Log an error message
     * @param {string} message - The message to log
     * @param {Object} [meta] - Additional metadata
     */
    error(message, meta = {}) {
        this.logger.error(message, { ...meta, timestamp: new Date().toISOString() });
    }

    /**
     * Log a debug message (only in development)
     * @param {string} message - The message to log
     * @param {Object} [meta] - Additional metadata
     */
    debug(message, meta = {}) {
        if (process.env.NODE_ENV === 'development') {
            this.logger.debug(message, { ...meta, timestamp: new Date().toISOString() });
        }
    }
}

// Export singleton instance
const instance = new Logger(logger);
module.exports = instance;