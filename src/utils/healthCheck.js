const { logger } = require('./logger');
const { client } = require('../bot');
const os = require('os');
const process = require('process');

class HealthCheck {
  constructor() {
    this.startTime = Date.now();
    this.checkInterval = 5 * 60 * 1000; // 5 minutes
    this.setupHealthChecks();
  }

  setupHealthChecks() {
    // Run initial health check
    this.runHealthCheck();
    
    // Schedule periodic health checks
    setInterval(() => this.runHealthCheck(), this.checkInterval);
  }

  async runHealthCheck() {
    try {
      const stats = await this.getSystemStats();
      logger.info('Health check completed', { stats });
      return { status: 'healthy', ...stats };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return { status: 'unhealthy', error: error.message };
    }
  }

  async getSystemStats() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: this.formatUptime(uptime),
      memory: {
        rss: this.formatBytes(memoryUsage.rss),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        external: this.formatBytes(memoryUsage.external || 0),
      },
      cpu: {
        loadavg: os.loadavg(),
        cpus: os.cpus().length,
      },
      discord: {
        ping: client.ws.ping,
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
      },
    };
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  }
}

const healthCheck = new HealthCheck();

module.exports = {
  healthCheck,
  HealthCheck
};
