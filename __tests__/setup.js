// Mock winston module to prevent file system operations
jest.mock('winston', () => {
  const format = {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
    json: jest.fn(),
    errors: jest.fn(),
    metadata: jest.fn(),
    splat: jest.fn(),
    simple: jest.fn(),
    prettyPrint: jest.fn(),
    label: jest.fn(),
  };

  const transports = {
    Console: jest.fn(),
    File: jest.fn(),
  };

  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };

  return {
    format,
    transports,
    createLogger: jest.fn(() => logger),
    addColors: jest.fn(),
  };
});

// Mock the logger module
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
  initialize: jest.fn().mockImplementation(function() {
    this.logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
    return this;
  }),
  getLogger: jest.fn().mockReturnThis(),
};

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: mockLogger,
  ...mockLogger,
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client-id';
process.env.LOG_LEVEL = 'info';
process.env.LOG_TO_FILE = 'false';

// Mock console methods to keep test output clean
const originalConsole = { ...console };
global.console = {
  ...originalConsole,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Add any global test setup here
beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Reset the mock logger
  Object.values(mockLogger).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockClear === 'function') {
      mock.mockClear();
    }
  });
  
  if (mockLogger.logger) {
    Object.values(mockLogger.logger).forEach(mock => {
      if (typeof mock === 'function' && typeof mock.mockClear === 'function') {
        mock.mockClear();
      }
    });
  }
});

// Global test timeout (10 seconds)
jest.setTimeout(10000);
