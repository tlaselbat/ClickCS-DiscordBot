const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const token = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN'; // Replace with your actual bot token

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Update presence
    client.user.setPresence({
        activities: [{
            name: 'Streaming on Twitch',
            type: ActivityType.Streaming,
            state: 'https://www.twitch.tv/your_twitch_channel',
            url: 'https://www.twitch.tv/your_twitch_channel'
        }],
        status: 'online'
    });

    // Log guild count
    console.log(`Serving ${client.guilds.cache.size} servers`);
});

// Login the client
client.login(token).catch(console.error);