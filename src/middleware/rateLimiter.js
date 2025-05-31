const { RateLimiter } = require('@sapphire/ratelimits');
const { RateLimitError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

// In-memory store for rate limiters
const rateLimiters = new Map();

/**
 * Creates a rate limiter middleware
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests per window
 * @param {string} [options.keyGenerator] - Function to generate rate limit key
 * @param {boolean} [options.skipFailedRequests] - Whether to skip failed requests
 * @param {boolean} [options.trustProxy] - Whether to trust X-Forwarded-For header
 * @returns {Function} Express middleware function
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000, // 15 minutes
  max = 100, // Limit each IP to 100 requests per windowMs
  keyGenerator = (req) => req.ip, // Default key generator uses IP
  skipFailedRequests = false,
  trustProxy = false,
} = {}) {
  return async (req, res, next) => {
    try {
      // Get the client's IP address
      let ip = req.ip;
      
      // If trustProxy is enabled, use X-Forwarded-For header
      if (trustProxy && req.headers['x-forwarded-for']) {
        const forwardedIps = req.headers['x-forwarded-for'].split(',');
        ip = forwardedIps[0].trim();
      }

      // Generate a unique key for this client
      const key = typeof keyGenerator === 'function' ? keyGenerator(req) : ip;
      
      // Get or create a rate limiter for this key
      if (!rateLimiters.has(key)) {
        rateLimiters.set(
          key,
          new RateLimiter({
            window: windowMs,
            limit: max,
          })
        );

        // Clean up old rate limiters to prevent memory leaks
        setTimeout(() => {
          rateLimiters.delete(key);
        }, windowMs);
      }

      const rateLimiter = rateLimiters.get(key);
      const result = rateLimiter.acquire();

      // Set rate limit headers
      const remaining = Math.max(0, max - result.used);
      res.set({
        'X-RateLimit-Limit': max.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': Math.ceil((result.resetTime.getTime() - Date.now()) / 1000).toString(),
      });

      // Check if rate limit is exceeded
      if (result.limited) {
        const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
        res.set('Retry-After', retryAfter.toString());
        throw new RateLimitError('Too many requests, please try again later', retryAfter);
      }

      // If we should skip failed requests, add a handler for the response finish event
      if (skipFailedRequests) {
        const originalEnd = res.end;
        res.end = function (chunk, encoding, callback) {
          // If the response status code indicates an error, don't count this request
          if (res.statusCode >= 400) {
            rateLimiter.revert(result.id);
          }
          originalEnd.call(res, chunk, encoding, callback);
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Global rate limiter middleware
 * Limits each IP to 100 requests per 15 minutes by default
 */
const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  skipFailedRequests: true, // Don't count failed requests against the limit
});

/**
 * Auth rate limiter middleware
 * Limits each IP to 5 login attempts per 15 minutes
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  keyGenerator: (req) => `auth:${req.ip}`, // Use a different key for auth endpoints
});

// Export the rate limiters
module.exports = {
  createRateLimiter,
  globalRateLimiter,
  authRateLimiter
};
