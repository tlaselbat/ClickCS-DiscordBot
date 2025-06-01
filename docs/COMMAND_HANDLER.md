# Command Handler Documentation

## Overview

The command handler now supports both legacy message commands and modern slash commands in a unified system.

## Command Structure

### Slash Commands
```javascript
// commands/ping.js
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    
    // Optional properties
    cooldown: 5, // Seconds
    guildOnly: true,
    ownerOnly: false,
    permissions: ['SEND_MESSAGES'],
    
    async execute(interaction) {
        // Command logic here
        await interaction.reply('Pong!');
    }
};
```

### Legacy Message Commands
```javascript
// commands/legacy/ping.js
module.exports = {
    name: 'ping',
    description: 'Check bot latency',
    isLegacy: true, // Mark as legacy command
    
    async execute(message, args) {
        // Command logic here
        message.reply('Pong!');
    }
};
```

## Features

- **Unified Command Registration**: Both command types use the same registration system
- **Cooldowns**: Built-in cooldown system for rate limiting
- **Permissions**: Easy permission handling
- **Error Handling**: Centralized error handling
- **Auto-deployment**: Easy command deployment with `deploy-commands.js`

## Registering Commands

1. Place commands in the `src/commands` directory
2. Use `npm run deploy` to register commands with Discord
3. Restart your bot to load the commands

## Best Practices

1. **Use Slash Commands** for new features
2. **Migrate** legacy commands when possible
3. **Use Subcommands** for related functionality
4. **Add Descriptions** to all commands and options
