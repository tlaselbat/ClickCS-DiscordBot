# Testing Guide for ClickCS Discord Bot

This guide provides comprehensive information on how to test the ClickCS Discord Bot, including unit tests, integration tests, and manual testing procedures.

## Table of Contents

- [Testing Environment Setup](#testing-environment-setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Mocking Discord.js](#mocking-discordjs)
- [Testing Best Practices](#testing-best-practices)
- [Debugging Tests](#debugging-tests)
- [Continuous Integration](#continuous-integration)
- [Code Coverage](#code-coverage)
- [Troubleshooting](#troubleshooting)

## Testing Environment Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ClickCS-DiscordBot.git
   cd ClickCS-DiscordBot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.test` file in the project root with test-specific environment variables:
   ```env
   NODE_ENV=test
   DISCORD_TOKEN=test_token
   CLIENT_ID=test_client_id
   GUILD_ID=test_guild_id
   ```

## Running Tests

### Running All Tests

```bash
npm test
```

### Running Tests in Watch Mode

```bash
npm run test:watch
```

### Running a Specific Test File

```bash
npx jest __tests__/path/to/testfile.test.js
```

### Running Tests with Debugging

```bash
npm run test:debug
```

### Running with Coverage Report

```bash
npx jest --coverage
```

## Test Structure

Tests are organized in the `__tests__` directory with the following structure:

```
__tests__/
  ├── unit/              # Unit tests
  │   ├── commands/      # Command handler tests
  │   ├── events/        # Event handler tests
  │   └── utils/         # Utility function tests
  ├── integration/       # Integration tests
  ├── setup.js           # Global test setup
  └── mocks/             # Mock implementations
```

## Writing Tests

### Test File Naming

- Test files should be named with the pattern `[name].test.js` or `[name].spec.js`
- Place test files next to the code they test or in the corresponding `__tests__` directory

### Basic Test Example

```javascript
const { myFunction } = require('../../src/utils/myModule');

describe('myFunction', () => {
  test('should return expected output', () => {
    const input = 'test';
    const expected = 'expected output';
    expect(myFunction(input)).toBe(expected);
  });
});
```

### Testing Async Code

```javascript
describe('asyncFunction', () => {
  test('should resolve with expected value', async () => {
    const result = await asyncFunction();
    expect(result).toBe('expected value');
  });

  test('should reject with error', async () => {
    await expect(asyncFunction(failingInput)).rejects.toThrow('Error message');
  });
});
```

## Mocking Discord.js

### Basic Mocking

```javascript
const { Client, GatewayIntentBits } = require('discord.js');

jest.mock('discord.js', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      login: jest.fn(),
      // Add other required methods
    })),
    GatewayIntentBits: {
      // Mock required GatewayIntentBits
    },
    // Add other required Discord.js exports
  };
});
```

### Mocking Discord.js Interactions

```javascript
const { Interaction } = require('discord.js');

const mockInteraction = {
  reply: jest.fn().mockResolvedValue(undefined),
  followUp: jest.fn().mockResolvedValue(undefined),
  // Add other interaction properties and methods
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('should handle interaction', async () => {
  await handleInteraction(mockInteraction);
  expect(mockInteraction.reply).toHaveBeenCalledWith('Expected response');
});
```

## Testing Best Practices

1. **Isolate Tests**: Each test should be independent and not rely on the state from other tests.
2. **Use Descriptive Test Names**: Clearly describe what each test is checking.
3. **Test Edge Cases**: Include tests for error conditions and edge cases.
4. **Mock External Dependencies**: Use mocks for Discord.js and other external services.
5. **Keep Tests Fast**: Avoid unnecessary I/O operations in tests.
6. **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it.

## Debugging Tests

### Using VS Code Debugger

1. Add this configuration to your `launch.json`:
   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "Jest Current File",
     "program": "${workspaceFolder}/node_modules/.bin/jest",
     "args": ["${fileBasename}", "--config", "jest.config.js"],
     "console": "integratedTerminal",
     "internalConsoleOptions": "neverOpen",
     "cwd": "${workspaceFolder}"
   }
   ```

2. Set breakpoints in your test or source code
3. Press F5 to start debugging

### Debugging with Chrome DevTools

1. Run tests with:
   ```bash
   node --inspect-brk node_modules/.bin/jest --runInBand
   ```
2. Open `chrome://inspect` in Chrome
3. Click on "Open dedicated DevTools for Node"

## Continuous Integration

The project includes GitHub Actions for CI. The workflow runs on every push and pull request, executing:

1. Linting with ESLint
2. Type checking (if applicable)
3. Unit tests
4. Integration tests

## Code Coverage

To generate a coverage report:

```bash
npx jest --coverage
```

This will create a `coverage` directory with HTML reports you can view in a browser.

## Troubleshooting

### Tests are failing with timeouts

- Increase the test timeout in `jest.config.js`
- Ensure all async operations are properly awaited
- Check for infinite loops or long-running operations

### Mocks not working as expected

- Ensure `jest.mock()` calls are at the top level of the test file
- Check for incorrect mock implementations
- Verify that you're not accidentally using the real implementation

### Discord.js errors in tests

- Make sure all required Discord.js methods are mocked
- Check that your test environment variables are set correctly
- Verify that your test setup correctly initializes the Discord client mock

### Debugging async/await issues

- Add `console.log` statements to track the flow of execution
- Use `try/catch` blocks to catch and log errors
- Consider using `--runInBand` to run tests sequentially

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Discord.js Guide - Testing](https://discordjs.guide/creating-your-bot/unit-testing/)
- [Testing Asynchronous Code](https://jestjs.io/docs/asynchronous)
- [Mock Functions](https://jestjs.io/docs/mock-functions)

## Contributing

When adding new features, please include corresponding tests. Follow these guidelines:

1. Write tests for all new features and bug fixes
2. Ensure all tests pass before submitting a pull request
3. Update this guide if you add new testing patterns or utilities
