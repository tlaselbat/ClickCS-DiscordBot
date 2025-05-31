const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// Security headers middleware
const securityHeaders = (app) => {
  // Set security HTTP headers
  app.use(helmet());
  
  // Additional security headers
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Enable XSS filter in browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Feature policy
    res.setHeader('Feature-Policy', "geolocation 'none'; microphone 'none'; camera 'none'");
    
    next();
  });

  logger.info('Security middleware initialized');
};

// Rate limiting middleware
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { 
      ip: req.ip,
      path: req.path,
      method: req.method 
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.'
    });
  }
});

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      logger.warn('Input validation failed', { 
        error: error.details[0].message,
        path: req.path,
        method: req.method 
      });
      return res.status(400).json({
        status: 'error',
        message: error.details[0].message
      });
    }
    next();
  };
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🔒' : err.stack,
    path: req.path,
    method: req.method
  });

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token'
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: err.message
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message
  });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;
  
  res.on('finish', () => {
    const { statusCode } = res;
    const responseTime = Date.now() - start;
    
    const logData = {
      method,
      url: originalUrl,
      status: statusCode,
      responseTime: `${responseTime}ms`,
      ip,
      userAgent: req.get('user-agent') || ''
    };
    
    if (statusCode >= 500) {
      logger.error('Request error', logData);
    } else if (statusCode >= 400) {
      logger.warn('Request warning', logData);
    } else {
      logger.info('Request', logData);
    }
  });
  
  next();
};

// Export all middleware functions
module.exports = {
  securityHeaders,
  rateLimiter,
  validateInput,
  errorHandler,
  requestLogger
};
