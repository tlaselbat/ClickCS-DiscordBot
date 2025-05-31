const logger = require('./logger');

/**
 * Sets up global process event handlers
 */
function setupProcessHandlers() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error, origin) => {
    logger.error('Uncaught Exception:', { error, origin });
    // Don't exit immediately, give time for logging
    setTimeout(() => process.exit(1), 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
  });

  // Handle process termination signals
  const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  shutdownSignals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      // Add cleanup logic here if needed
      process.exit(0);
    });
  });

  // Log process info
  process.on('exit', (code) => {
    logger.info(`Process exiting with code ${code}`);
  });

  // Log memory usage periodically
  if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      logger.debug('Memory usage:', {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
      });
    }, 60000); // Log every minute
  }
}

module.exports = {
  setupProcessHandlers,
};
