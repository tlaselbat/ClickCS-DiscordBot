const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    const commands = new Map();
    const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(__dirname, '../commands', file));
        commands.set(command.name, command);
    }

    client.commands = commands;

    client.on('message', async (message) => {
        if (!message.content.startsWith(config.get('prefix')) || message.author.bot) return;

        const args = message.content.slice(config.get('prefix').length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            message.reply('There was an error trying to execute that command!');
        }
    });
};