const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const token = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN'; // Replace with your actual bot token

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

module.exports = async (client) => {
    // Wait for client to be fully initialized
    await new Promise(resolve => {
        if (client.user) {
            resolve();
        } else {
            client.once('ready', resolve);
        }
    });

    console.log(`Logged in as ${client.user.tag}!`);

    // Update presence
    await client.user.setPresence({
        activities: [{
            name: 'on servers',
            type: ActivityType.Watching
        }],
        status: 'online'
    });

    // Log guild count
    console.log(`Serving ${client.guilds.cache.size} servers`);
};
