// Test script to verify logger functionality
import logger from './src/utils/logger.js';

async function testLogger() {
  console.log('Testing logger...');
  
  // Test different log levels
  await logger.error('This is an error message', { code: 'TEST_ERROR', details: 'Test error details' });
  await logger.warn('This is a warning message', { warning: 'Test warning' });
  await logger.info('This is an info message', { info: 'Test info' });
  await logger.http('This is an HTTP message', { method: 'GET', path: '/test' });
  await logger.verbose('This is a verbose message', { data: 'Some verbose data' });
  await logger.debug('This is a debug message', { debug: 'Debug information' });
  await logger.silly('This is a silly message', { silly: 'Silly data' });
  
  // Test child logger
  const childLogger = logger.child({ module: 'test-module' });
  await childLogger.info('This is a message from child logger');
  
  console.log('Logger test completed. Check the logs directory for output.');
}

testLogger().catch(console.error);
