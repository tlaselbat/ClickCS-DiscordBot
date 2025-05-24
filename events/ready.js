const { ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Default presence configuration
const defaultPresence = {
    status: 'online',
    activities: [{
        name: 'on {guilds} servers',
        type: 'WATCHING'
    }],
    updateInterval: 300000,
    randomizeStatus: true
};

// Cache for presence configuration
let presenceConfig = { ...defaultPresence };

// Activity type mapping
const activityTypes = {
    'PLAYING': ActivityType.Playing,
    'STREAMING': ActivityType.Streaming,
    'LISTENING': ActivityType.Listening,
    'WATCHING': ActivityType.Watching,
    'COMPETING': ActivityType.Competing
};

// Format status text with variables
function formatStatus(text, client, config = {}) {
    if (!text) return '';
    return text
        .replace(/{prefix}/g, config.bot?.prefix || '!')
        .replace(/{version}/g, config.bot?.version || '1.0.0')
        .replace(/{guilds}/g, client.guilds.cache.size.toString())
        .replace(/{users}/g, client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0).toString());
}

// Load presence configuration
async function loadPresenceConfig() {
    try {
        const configPath = path.join(process.cwd(), 'config', 'presence-config.json');
        const data = await fs.readFile(configPath, 'utf8');
        presenceConfig = { ...defaultPresence, ...JSON.parse(data) };
        console.log('Loaded presence configuration');
    } catch (error) {
        console.warn('Using default presence configuration:', error.message);
    }
}

// Update bot's presence
async function updatePresence(client, config = {}) {
    try {
        if (!presenceConfig.activities || presenceConfig.activities.length === 0) return;
        
        let activity = presenceConfig.activities[0];
        
        if (presenceConfig.randomizeStatus && presenceConfig.activities.length > 1) {
            const randomIndex = Math.floor(Math.random() * presenceConfig.activities.length);
            activity = presenceConfig.activities[randomIndex];
        }
        
        const formattedName = formatStatus(activity.name, client, config);
        const activityType = activityTypes[activity.type] || ActivityType.Playing;
        
        await client.user.setPresence({
            activities: [{
                name: formattedName,
                type: activityType,
                url: activity.url
            }],
            status: presenceConfig.status || 'online'
        });
        
        // Log status message if available
        if (presenceConfig.statusMessages?.length > 0) {
            const statusIndex = presenceConfig.randomizeStatus 
                ? Math.floor(Math.random() * presenceConfig.statusMessages.length)
                : 0;
            const statusMessage = formatStatus(presenceConfig.statusMessages[statusIndex], client, config);
            console.log(statusMessage);
        }
    } catch (error) {
        console.error('Error updating presence:', error);
    }
}

module.exports = async (client) => {
    // Load config directly in the ready event
    const config = require('../utils/config');
    // Wait for client to be fully initialized
    await new Promise(resolve => {
        if (client.user) {
            resolve();
        } else {
            client.once('ready', resolve);
        }
    });

    console.log(`Logged in as ${client.user.tag}!`);
    
    // Load presence configuration
    await loadPresenceConfig();
    
    // Initial presence update
    await updatePresence(client, config);
    
    // Set up periodic updates if interval is configured
    if (presenceConfig.updateInterval > 0) {
        setInterval(
            () => updatePresence(client, config),
            presenceConfig.updateInterval
        );
    }

    // Log guild count
    console.log(`Serving ${client.guilds.cache.size} servers with ${client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)} users`);
};
