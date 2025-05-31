const { logger } = require('./logger');
const { formatBytes } = require('./common');
const { healthCheck } = require('./healthCheck');
// Remove circular import
// const { memoryManager } = require('./memoryManager');
const { securityHeaders, rateLimiter, errorHandler } = require('../middleware/security');

// Initialize health checks
healthCheck;

// Initialize memory monitoring
memoryManager;

// Add security middleware to your Express app (if applicable)
app.use(securityHeaders);
app.use(rateLimiter);

// Add error handling (should be last)
app.use(errorHandler);

class MemoryManager {
  constructor() {
    this.initialMemory = process.memoryUsage();
    this.leakThreshold = 100 * 1024 * 1024; // 100MB
    this.leakCheckInterval = 5 * 60 * 1000; // 5 minutes
    this.leakWarningShown = false;
    this.startMemoryMonitoring();
  }

  /**
   * Start monitoring memory usage
   */
  startMemoryMonitoring() {
    // Initial memory usage log
    this.logMemoryUsage('Initial memory usage');

    // Periodic memory check
    this.monitorInterval = setInterval(() => {
      this.checkMemoryLeaks();
      this.logMemoryUsage('Periodic memory check');
    }, this.leakCheckInterval);

    // Log memory usage on process exit
    process.on('exit', () => {
      this.logMemoryUsage('Process exiting');
      this.cleanup();
    });

    // Handle process termination signals
    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(signal => {
      process.on(signal, () => {
        logger.warn(`Received ${signal}. Cleaning up...`);
        this.cleanup();
        process.exit(0);
      });
    });
  }

  /**
   * Check for potential memory leaks
   */
  checkMemoryLeaks() {
    const currentMemory = process.memoryUsage();
    const rssGrowth = currentMemory.rss - this.initialMemory.rss;
    
    if (rssGrowth > this.leakThreshold && !this.leakWarningShown) {
      logger.warn('Potential memory leak detected', {
        growth: formatBytes(rssGrowth),
        threshold: formatBytes(this.leakThreshold),
        initialRSS: formatBytes(this.initialMemory.rss),
        currentRSS: formatBytes(currentMemory.rss)
      });
      this.leakWarningShown = true;
    } else if (rssGrowth <= this.leakThreshold) {
      this.leakWarningShown = false;
    }
  }

  /**
   * Log current memory usage
   * @param {string} context - Context for the log message
   */
  logMemoryUsage(context = 'Memory usage') {
    const memory = process.memoryUsage();
    
    logger.info(context, {
      rss: formatBytes(memory.rss),
      heapTotal: formatBytes(memory.heapTotal),
      heapUsed: formatBytes(memory.heapUsed),
      external: formatBytes(memory.external || 0),
      arrayBuffers: formatBytes(memory.arrayBuffers || 0)
    });
  }

  /**
   * Force garbage collection (requires --expose-gc flag)
   */
  forceGarbageCollection() {
    if (global.gc) {
      global.gc();
      logger.debug('Garbage collection forced');
      this.logMemoryUsage('After garbage collection');
    } else {
      logger.warn('Garbage collection not available. Run with --expose-gc flag.');
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    // Log final memory usage
    this.logMemoryUsage('Final memory usage before exit');
    
    // Additional cleanup can be added here
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory usage statistics
   */
  getMemoryStats() {
    const memory = process.memoryUsage();
    return {
      rss: {
        value: memory.rss,
        formatted: formatBytes(memory.rss)
      },
      heapTotal: {
        value: memory.heapTotal,
        formatted: formatBytes(memory.heapTotal)
      },
      heapUsed: {
        value: memory.heapUsed,
        formatted: formatBytes(memory.heapUsed)
      },
      external: {
        value: memory.external || 0,
        formatted: formatBytes(memory.external || 0)
      },
      arrayBuffers: {
        value: memory.arrayBuffers || 0,
        formatted: formatBytes(memory.arrayBuffers || 0)
      }
    };
  }
}

// Create a singleton instance
const memoryManager = new MemoryManager();

// Export the MemoryManager class and the singleton instance
module.exports = {
  MemoryManager,
  memoryManager
};
