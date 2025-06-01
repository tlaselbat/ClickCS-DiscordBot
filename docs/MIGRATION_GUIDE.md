# Command Migration Guide

This guide will help you migrate legacy message commands to the new slash command format.

## Migration Steps

1. **Update Command Structure**
   - Move from `module.exports = { name, execute }` to using `SlashCommandBuilder`
   - Add proper command descriptions and options

2. **Update Command Logic**
   - Replace `message` parameter with `interaction`
   - Use `interaction.reply()` instead of `message.channel.send()`
   - Update any permission checks to use Discord's built-in permissions system

3. **Example Migration**

**Before (Legacy):**
```javascript
// ping.js
module.exports = {
    name: 'ping',
    description: 'Check bot latency',
    async execute(message, args) {
        const msg = await message.channel.send('Pinging...');
        const latency = msg.createdTimestamp - message.createdTimestamp;
        msg.edit(`Pong! Latency: ${latency}ms`);
    }
};
```

**After (Slash Command):**
```javascript
// ping.js
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`Pong! Latency: ${latency}ms`);
    }
};
```

## Best Practices

1. **Use Subcommands** for related commands (e.g., `config get` and `config set`)
2. **Add input validation** using SlashCommandBuilder options
3. **Use proper option types** (STRING, INTEGER, BOOLEAN, etc.)
4. **Add cooldowns** using the built-in cooldown system

## Testing

1. Use `npm run deploy` or `node src/deploy-commands.js` to register your commands
2. Restart your bot to load the new command
3. Test the command in your server
