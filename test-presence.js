// Simple test script to verify presence functionality
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Mock the required modules
const mockClient = {
  user: {
    setPresence: (presence) => {
      console.log('Setting presence:', presence);
      return Promise.resolve();
    },
    presence: {
      status: 'online',
      activities: []
    }
  },
  isReady: () => true,
  guilds: {
    cache: {
      size: 5,
      reduce: (fn, initial) => initial + 25 // For member count
    }
  }
};

// Import the ready module
const readyModule = await import('./src/events/ready.js');

// Test the functions
console.log('Testing setBasicPresence...');
const result = await readyModule.setBasicPresence(mockClient, {
  name: 'Test Bot',
  type: 'PLAYING',
  status: 'online'
});

console.log('setBasicPresence result:', result);

console.log('Testing updatePresence...');
const updateResult = await readyModule.updatePresence(mockClient, {
  config: {
    status: 'online',
    activities: [
      { name: 'with 5 servers', type: 'PLAYING' },
      { name: 'with 25 users', type: 'WATCHING' }
    ]
  }
});

console.log('updatePresence result:', updateResult);

console.log('Testing startPresenceRotation...');
const rotationResult = await readyModule.startPresenceRotation(mockClient);
console.log('startPresenceRotation result:', rotationResult);

// Clean up after a short delay
setTimeout(() => {
  console.log('Stopping presence rotation...');
  readyModule.stopPresenceRotation();
  console.log('Done!');
}, 3000);
