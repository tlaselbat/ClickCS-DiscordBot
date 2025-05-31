/**
 * Common utility functions used across the application
 */

const { logger } = require('./logger');

/**
 * Format a duration in milliseconds to a human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string (e.g., "2d 3h 5m 10s")
 */
const formatDuration = (ms) => {
  if (typeof ms !== 'number' || ms < 0) {
    logger.warn('Invalid duration provided to formatDuration', { ms });
    return '0s';
  }

  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

/**
 * Format a number to a human-readable string with K/M/B suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted number (e.g., "1.2K", "3.4M")
 */
const formatNumber = (num) => {
  if (typeof num !== 'number') {
    logger.warn('Invalid number provided to formatNumber', { num });
    return '0';
  }

  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Deep cloned object
 */
const deepClone = (obj) => {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    logger.error('Error in deepClone', { error });
    return null;
  }
};

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 * @param {*} value - Value to check
 * @returns {boolean} True if the value is empty
 */
const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the random string
 * @returns {string} Random string
 */
const generateRandomString = (length = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Parse a string to boolean
 * @param {string} value - String to parse
 * @param {boolean} defaultValue - Default value if parsing fails
 * @returns {boolean} Parsed boolean value
 */
const parseBoolean = (value, defaultValue = false) => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    if (['true', 'yes', '1', 'y'].includes(lowerValue)) return true;
    if (['false', 'no', '0', 'n'].includes(lowerValue)) return false;
  }
  return defaultValue;
};

/**
 * Safely access nested object properties
 * @param {Object} obj - Object to access
 * @param {string|Array} path - Path to the property
 * @param {*} defaultValue - Default value if property doesn't exist
 * @returns {*} Property value or default value
 */
const getNestedValue = (obj, path, defaultValue = undefined) => {
  try {
    const pathArray = Array.isArray(path) 
      ? path 
      : path.split('.').filter(Boolean);
    
    return pathArray.reduce((acc, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return acc[key];
      }
      return defaultValue;
    }, obj);
  } catch (error) {
    logger.error('Error in getNestedValue', { error });
    return defaultValue;
  }
};

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
const throttle = (func, limit = 300) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};
