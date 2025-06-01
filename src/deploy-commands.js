const { REST, Routes } = require('discord.js');
const { config } = require('dotenv');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
config();

// Import the command handler
const commandHandler = require('./handlers/commandHandler');

async function deployCommands() {
    try {
        // Load commands
        console.log('🔍 Loading commands...');
        await commandHandler.loadCommands();

        // Log all commands for debugging
        console.log('\n📋 All registered commands:');
        commandHandler.commands.forEach((cmd, name) => {
            console.log(`- ${name} (${cmd.data?.name || 'no data'})`);
        });

        // Get the command data from the command handler
        const commands = [
            ...commandHandler.slashCommands,
            ...commandHandler.contextMenus
        ].map(cmd => {
            console.log(`✅ Preparing command: ${cmd.name}`);
            // Get the command data as a plain object
            const commandData = typeof cmd.toJSON === 'function' 
                ? cmd.toJSON() 
                : cmd;
            
            // Ensure we have a clean, serializable object
            const cleanCommand = {
                name: commandData.name,
                description: commandData.description || 'No description provided',
                options: commandData.options || [],
                default_permission: commandData.default_permission,
                type: commandData.type
            };
            
            // Remove undefined properties
            Object.keys(cleanCommand).forEach(key => 
                cleanCommand[key] === undefined && delete cleanCommand[key]
            );
            
            return cleanCommand;
        });

        console.log(`\n📝 Registering ${commands.length} commands...`);

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        const route = process.env.GUILD_ID
          ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
          : Routes.applicationCommands(process.env.CLIENT_ID);

        console.log(`\n🔄 Deploying commands to ${process.env.GUILD_ID ? 'guild' : 'global'} route: ${route}`);

        const data = await rest.put(route, { body: commands });

        console.log(`\n✅ Successfully registered ${data.length} application commands`);
        console.log('\n✨ Deployment complete!');

    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
}

deployCommands();
