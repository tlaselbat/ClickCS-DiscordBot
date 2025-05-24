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
    const configDir = path.join(process.cwd(), 'config');
    const configPath = path.join(configDir, 'presence-config.json');
    
    try {
        // Ensure config directory exists
        try {
            await fs.mkdir(configDir, { recursive: true });
        } catch (mkdirError) {
            if (mkdirError.code !== 'EEXIST') {
                throw mkdirError;
            }
        }
        
        // Check if config file exists
        try {
            await fs.access(configPath);
            console.log('✅ Config file exists, loading...');
            
            // Read and parse the config file
            const configData = await fs.readFile(configPath, 'utf8');
            presenceConfig = JSON.parse(configData);
            console.log('✅ Successfully loaded presence config');
            return true;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️ Config file not found, creating default...');
                const defaultConfig = {
                    status: 'online',
                    activities: [
                        { name: 'on {guilds} servers', type: 'WATCHING' },
                        { name: 'with {users} users', type: 'PLAYING' },
                        { name: 'v{version}', type: 'PLAYING' },
                        { name: '{prefix}help', type: 'LISTENING' }
                    ],
                    statusMessages: [
                        'Serving {guilds} servers with {users} users',
                        'Version {version} | Prefix: {prefix}',
                        'Type {prefix}help for commands'
                    ],
                    updateInterval: 120000,
                    randomizeStatus: true
                };
                
                await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 4));
                console.log('✅ Created default presence config file');
                presenceConfig = defaultConfig;
                return true;
            }
            throw error;
        }
        
        // The config is already loaded in the try-catch block above
        // No need to load it again
    } catch (error) {
        console.error('❌ Error loading presence configuration:', {
            message: error.message,
            stack: error.stack
        });
        console.log('⚠️ Falling back to default presence configuration');
        presenceConfig = { ...defaultPresence }; // Reset to defaults
        return false;
    }
}

// Update bot's presence
async function updatePresence(client, config = {}) {
    try {
        console.log('🔄 [DEBUG] Attempting to update presence...');
        console.log('[DEBUG] Client user:', client.user ? 'exists' : 'does not exist');
        
        if (!client.user) {
            throw new Error('Client user is not available');
        }
        
        console.log('[DEBUG] Current presenceConfig:', JSON.stringify(presenceConfig, null, 2));
        
        if (!presenceConfig.activities || presenceConfig.activities.length === 0) {
            console.warn('⚠️ [DEBUG] No activities found in presence config, using default');
            presenceConfig.activities = defaultPresence.activities;
        }
        
        // Select activity
        let activity = presenceConfig.activities[0];
        if (presenceConfig.randomizeStatus && presenceConfig.activities.length > 1) {
            const randomIndex = Math.floor(Math.random() * presenceConfig.activities.length);
            activity = presenceConfig.activities[randomIndex];
        }
        
        console.log('📝 Selected activity:', {
            name: activity.name,
            type: activity.type || 'PLAYING'  // Ensure type has a default
        });
        
        // Format the activity name with dynamic variables
        try {
            const formattedName = formatStatus(activity.name, client, config);
            const activityType = activityTypes[activity.type] || ActivityType.Playing;
            
            console.log('🔄 Setting presence with:', {
                name: formattedName,
                type: activity.type,
                status: presenceConfig.status || 'online'
            });
            
            // Set the presence
            await client.user.setPresence({
                activities: [{
                    name: formattedName,
                    type: activityType,
                    url: activity.url
                }],
                status: presenceConfig.status || 'online'
            });
            
            console.log('✅ Presence updated successfully');
        } catch (formatError) {
            console.error('❌ Error formatting status:', formatError);
            // Fallback to a simple presence if formatting fails
            await client.user.setPresence({
                activities: [{
                    name: 'Discord Bot',
                    type: ActivityType.Playing
                }],
                status: 'online'
            });
            console.log('✅ Set fallback presence');
        }
        
        // Log status message if available
        if (presenceConfig.statusMessages?.length > 0) {
            const statusIndex = presenceConfig.randomizeStatus 
                ? Math.floor(Math.random() * presenceConfig.statusMessages.length)
                : 0;
            const statusMessage = formatStatus(presenceConfig.statusMessages[statusIndex], client, config);
            console.log('📢 Status message:', statusMessage);
        }
    } catch (error) {
        console.error('❌ Error updating presence:', {
            message: error.message,
            stack: error.stack
        });
    }
}

module.exports = async (client) => {
    try {
        console.log('🚀 [DEBUG] Starting ready event handler...');
        
        // Load config directly in the ready event
        console.log('🔧 [DEBUG] Loading config...');
        let config;
        try {
            config = require('../utils/config');
            console.log('[DEBUG] Successfully loaded config');
        } catch (configError) {
            console.error('❌ Error loading config:', configError);
            console.log('⚠️ Using empty config object');
            config = {}; // Use empty config as fallback
        }
        
        // Wait for client to be fully initialized
        console.log('⏳ [DEBUG] Waiting for client to be ready...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timed out waiting for client to be ready'));
            }, 10000); // 10 second timeout
            
            if (client.user) {
                console.log('✅ Client is already ready');
                clearTimeout(timeout);
                resolve();
            } else {
                console.log('⏳ Waiting for ready event...');
                client.once('ready', () => {
                    console.log('✅ Client is now ready');
                    clearTimeout(timeout);
                    resolve();
                });
            }
        });

        console.log(`🤖 Logged in as ${client.user.tag}!`);
        
        // Load presence configuration
        console.log('🔄 Loading presence configuration...');
        try {
            const configLoaded = await loadPresenceConfig();
            
            if (configLoaded) {
                console.log('🔄 Updating presence...');
                try {
                    await updatePresence(client, config);
                    console.log('✅ Presence updated successfully');
                } catch (updateError) {
                    console.error('❌ Failed to update presence:', updateError);
                    // Try a basic presence update as fallback
                    try {
                        await client.user.setPresence({
                            activities: [{
                                name: 'Discord Bot',
                                type: ActivityType.Playing
                            }],
                            status: 'online'
                        });
                        console.log('✅ Set basic presence as fallback');
                    } catch (fallbackError) {
                        console.error('❌ Failed to set fallback presence:', fallbackError);
                    }
                }
                
                // Set up periodic updates if interval is configured
                if (presenceConfig.updateInterval > 0) {
                    console.log(`🔄 Setting up presence updates every ${presenceConfig.updateInterval/1000} seconds`);
                    setInterval(
                        () => {
                            console.log('🔄 Updating presence (scheduled)...');
                            updatePresence(client, config).catch(error => {
                                console.error('❌ Error in scheduled presence update:', error);
                            });
                        },
                        presenceConfig.updateInterval
                    );
                }
            } else {
                console.warn('⚠️ Using default presence configuration');
                await updatePresence(client, config);
            }

        // Log guild count
        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        console.log(`🌐 Serving ${guildCount} servers with ${userCount} users`);
        
        } catch (error) {
            console.error('❌ Error in ready event handler:', error);
        }
    } catch (error) {
        console.error('❌ Fatal error in ready event handler:', error);
    }
};
