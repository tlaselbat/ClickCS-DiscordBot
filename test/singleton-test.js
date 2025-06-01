const { Collection } = require('discord.js');
const commandHandler = require('../src/handlers/commandHandler');

// Configure test timeout
const TEST_TIMEOUT = 5000; // 5 seconds

// Mock logger
const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug
};

// Mock Discord.js Message
class MockMessage {
  constructor(content, author = { bot: false, tag: 'TestUser#1234' }, channel = {}) {
    this.content = content;
    this.author = author;
    this.channel = channel;
    this.guild = {
      me: {
        permissionsIn: () => ({
          has: () => true
        })
      }
    };
    this.replied = false;
    this.replies = [];
    
    // Add debug logging for message creation
    console.log(`  Created message with content: "${content}"`);
  }

  async reply(content) {
    this.replied = true;
    this.replies.push(content);
    return { 
      deletable: true, 
      delete: () => Promise.resolve() 
    };
  }
}

// Test suite
async function runTests() {
  console.log('=== Starting Singleton Command Handler Tests ===');
  console.log('Starting test suite...\n');
  
  const testStartTime = Date.now();
  const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
  };

    // Helper function to clear command handler state
  function clearCommandHandler() {
    commandHandler.commands.clear();
    commandHandler.aliases.clear();
    commandHandler.cooldowns.clear();
    commandHandler.slashCommands = [];
    commandHandler.contextMenus = [];
  }

  // Helper function to run a single test
  async function runTest(name, testFn) {
    const testId = ++testResults.total;
    const startTime = Date.now();
    
    // Clear command handler state before each test
    clearCommandHandler();
    
    console.log(`[${new Date().toISOString()}] [TEST #${testId}] ${name} - START`);
    
    try {
      // Set a timeout for the test
      await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Test timed out after ${TEST_TIMEOUT}ms`)), TEST_TIMEOUT)
        )
      ]);
      
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] [TEST #${testId}] ${name} - PASSED (${duration}ms)`);
      testResults.passed++;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] [TEST #${testId}] ${name} - FAILED (${duration}ms)`);
      console.error('Error:', error);
      testResults.failed++;
      testResults.errors.push({
        test: name,
        error: error.message || String(error)
      });
    }
    
    console.log(''); // Add spacing between tests
  }

  // Test 1: Register Command
  await runTest('Test registerCommand method', async () => {
    console.log('  Testing registerCommand method...');
    
    // Store the original commands count
    const originalCount = commandHandler.commands.size;
    const testCommandName = 'test' + Date.now(); // Use a unique name
    
    // Register a test command with isLegacy flag
    commandHandler.registerCommand({
      name: testCommandName,
      description: 'Test command',
      isLegacy: true, // Mark as legacy command
      execute: async () => {}
    });
    
    // Check if the command was registered
    if (commandHandler.commands.size <= originalCount) {
      throw new Error('Command not registered');
    }
    
    console.log('  Command registered successfully');
  });

  // Test 2: Handle Message Command
  await runTest('Test handleMessage method', async () => {
    // Add debug logging for command handler state
    console.log('  Command handler commands:', [...commandHandler.commands.keys()]);
    // Register a test command with a unique name
    const testCommandName = 'test' + Date.now();
    console.log('  Test command name:', testCommandName);
    
    // Add debug logging for command registration
    console.log('  Registering command with name:', testCommandName);
    
    const testCommand = {
      name: testCommandName,
      description: 'Test command',
      isLegacy: true,
      execute: async (message) => {
        console.log('  - Test command execute function called');
        // Make sure to reply to the message
        await message.reply('Command executed successfully!');
        return new Promise(resolve => {
          console.log('  - Command execution started');
          // Simulate async work
          setTimeout(() => {
            console.log('  - Command execution completed');
            resolve();
          }, 100);
        });
      }
    };
    
    commandHandler.registerCommand(testCommand);
    console.log('  Test command registered');
    
    // Create a test message with the unique command name
    const message = new MockMessage(`!${testCommandName}`, { bot: false, tag: 'TestUser#1234' });
    console.log('  Created mock message');
    
    // Handle the message
    console.log('  Calling handleMessage...');
    console.log('  Message content:', message.content);
    console.log('  Available commands:', [...commandHandler.commands.entries()].map(([name, cmd]) => ({
      name,
      isLegacy: cmd.isLegacy,
      type: cmd.data?.type || 'legacy'
    })));
    
    try {
      const result = await commandHandler.handleMessage(message, '!');
      console.log('  handleMessage result:', result);
      
      if (result !== true) {
        throw new Error(`handleMessage returned ${result} instead of true`);
      }
    } catch (error) {
      console.error('  Error in handleMessage:', error);
      throw error;
    }
    
    if (!message.replied) {
      throw new Error('Command did not reply to the message');
    }
    
    console.log('  Command executed successfully');
  });

  // Test 3: Test cooldown functionality
  await runTest('Test command cooldown', async () => {
    // Add debug logging for command handler state
    console.log('  Command handler commands (cooldown test):', [...commandHandler.commands.keys()]);
    const testCommandName = 'cooldown' + Date.now(); // Unique name for this test
    const userId = 'test-user-' + Date.now(); // Unique user ID for this test
    
    // Create a command that will be called multiple times
    let executionCount = 0;
    const testCommand = {
      name: testCommandName,
      description: 'Test cooldown',
      isLegacy: true,
      cooldown: 5, // 5 seconds
      execute: async (message) => {
        executionCount++;
        console.log(`  - Command execution #${executionCount}`);
        await message.reply(`Command executed (${executionCount})`);
      }
    };
    
    // Register the test command
    commandHandler.registerCommand(testCommand);
    
    // First execution - should succeed
    const message1 = new MockMessage(`!${testCommandName}`, { 
      id: userId, 
      bot: false, 
      tag: 'TestUser#1234' 
    });
    
    console.log('  First execution message:', message1.content);
    
    // First execution should not be rate limited
    try {
      const result1 = await commandHandler.handleMessage(message1, '!');
      console.log('  First execution result:', result1, 'Replied:', message1.replied);
      
      if (result1 !== true) {
        throw new Error(`First command execution returned ${result1} instead of true`);
      }
      
      // Verify the first execution replied
      if (!message1.replied) {
        throw new Error('First command execution did not reply');
      }
    } catch (error) {
      console.error('  Error in first command execution:', error);
      throw error;
    }
    
    // Second execution - should be rate limited
    const message2 = new MockMessage(`!${testCommandName}`, { 
      id: userId, // Same user ID to trigger cooldown
      bot: false, 
      tag: 'TestUser#1234' 
    });
    
    console.log('  Second execution message:', message2.content);
    
    // Second execution should be rate limited
    try {
      const result2 = await commandHandler.handleMessage(message2, '!');
      console.log('  Second execution result:', result2, 'Replied:', message2.replied);
      
      // The command should still be considered handled (return true) even when rate limited
      if (result2 !== true) {
        throw new Error(`Rate limited command returned ${result2} instead of true`);
      }
      
      // The cooldown message should be sent as a reply
      if (!message2.replied) {
        throw new Error('Cooldown message not sent');
      }
      
      console.log('  Cooldown message was sent successfully');
    } catch (error) {
      console.error('  Error in second command execution:', error);
      throw error;
    }
  });

  // Print summary
  const totalDuration = Date.now() - testStartTime;
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Duration: ${totalDuration}ms`);
  
  if (testResults.failed > 0) {
    console.log('\nFailed Tests:');
    testResults.errors.forEach((err, index) => {
      console.log(`${index + 1}. ${err.test}: ${err.error}`);
    });
    process.exit(1);
  }
  
  console.log('\nAll tests passed successfully!');
  process.exit(0);
}

// Run the tests
runTests().catch(error => {
  console.error('Unhandled error in test suite:', error);
  process.exit(1);
});
