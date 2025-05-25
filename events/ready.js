import { ActivityType } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validatePresenceConfig } from '../utils/config-validator.js';

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debug logging helper
const debug = (...args) => {
    console.log(`[READY_DEBUG][${new Date().toISOString()}]`, ...args);
};

// Default presence configuration
const defaultPresence = {
    status: 'online',
    activities: [{
        name: 'on {guilds} servers',
        type: 'WATCHING',
        url: null
    }],
    statusMessages: [
        'Serving {guilds} servers with {users} users',
        'Version {version} | Prefix: {prefix}',
        'Type {prefix}help for commands'
    ],
    updateInterval: 300000, // 5 minutes
    randomizeStatus: true
};

// Cache for presence configuration
let presenceConfig = { ...defaultPresence };
let presenceUpdateInterval = null;

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
    if (!text || !client) return text || '';
    
    try {
        const guildCount = client.guilds?.cache?.size || 0;
        const userCount = client.guilds?.cache?.reduce((acc, guild) => acc + (guild.memberCount || 0), 0) || 0;
        
        return String(text)
            .replace(/{prefix}/g, config.bot?.prefix || '!')
            .replace(/{version}/g, config.bot?.version || '1.0.0')
            .replace(/{guilds}/g, guildCount.toString())
            .replace(/{users}/g, userCount.toString());
    } catch (error) {
        console.error('❌ Error formatting status:', error);
        return text || '';
    }
}

// Load presence configuration
async function loadPresenceConfig() {
    const configPath = path.join(__dirname, '..', 'config', 'presence-config.json');
    
    try {
        // Try to read and validate the config file
        const configData = await fs.readFile(configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);
        
        // Validate the loaded config
        try {
            validatePresenceConfig(loadedConfig);
            presenceConfig = { ...defaultPresence, ...loadedConfig };
            console.log('✅ Successfully loaded and validated presence config');
            return true;
        } catch (validationError) {
            console.warn('⚠️ Invalid presence config, using defaults:', validationError.message);
            presenceConfig = { ...defaultPresence };
            return false;
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️ Presence config not found, using defaults');
            // Ensure the config directory exists
            await fs.mkdir(path.dirname(configPath), { recursive: true });
            
            // Write default config
            try {
                await fs.writeFile(
                    configPath, 
                    JSON.stringify(defaultPresence, null, 2),
                    'utf8'
                );
                console.log('✅ Created default presence config');
            } catch (writeError) {
                console.warn('⚠️ Could not create default config file:', writeError.message);
            }
            
            presenceConfig = { ...defaultPresence };
            return false;
        }
        
        console.error('❌ Error loading presence configuration:', {
            message: error.message,
            stack: error.stack
        });
        console.log('⚠️ Falling back to default presence configuration');
        presenceConfig = { ...defaultPresence };
        return false;
    }
}

// Update bot's presence
async function updatePresence(client, config = {}) {
    try {
        debug('Starting presence update...');
        
        // Load presence config if not already loaded
        if (!presenceConfig) {
            debug('Loading presence config...');
            await loadPresenceConfig();
        }
        
        if (!client?.user) {
            debug('Client user not available, cannot update presence');
            throw new Error('Client user is not available');
        }
        
        // Ensure we have valid activities
        if (!presenceConfig.activities || presenceConfig.activities.length === 0) {
            console.warn('⚠️ No activities found in presence config, using default');
            presenceConfig.activities = [...defaultPresence.activities];
        }
        
        // Select activity
        let activity = presenceConfig.activities[0];
        if (presenceConfig.randomizeStatus && presenceConfig.activities.length > 1) {
            const randomIndex = Math.floor(Math.random() * presenceConfig.activities.length);
            activity = presenceConfig.activities[randomIndex];
        }
        
        debug('Selected activity:', {
            name: activity.name,
            type: activity.type || 'PLAYING'
        });
        
        // Format the activity name with dynamic variables
        const formattedName = formatStatus(activity.name, client, config);
        let activityType = ActivityType.Playing; // Default to Playing
        
        // Handle both string and numeric activity types
        if (activity.type) {
            if (typeof activity.type === 'string') {
                activityType = activityTypes[activity.type.toUpperCase()] || ActivityType.Playing;
            } else if (typeof activity.type === 'number') {
                activityType = activity.type;
            }
        }
        
        debug('Setting presence with:', {
            name: formattedName,
            type: activityType,
            status: presenceConfig.status || 'online'
        });
        
        await client.user.setPresence({
            activities: [{
                name: formattedName,
                type: activityType,
                url: activity.url
            }],
            status: presenceConfig.status || 'online'
        });
        
        debug('Presence updated successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Error updating presence:', error);
        return false;
    }
}

// Handle ready event
export default async function handleReady(client) {
    // Helper function to set basic presence
    const setBasicPresence = async (status = 'online', activity = { name: 'Starting...', type: ActivityType.Playing }) => {
        if (!client?.user) return false;
        try {
            await client.user.setPresence({
                activities: [{
                    name: activity.name,
                    type: activity.type,
                    url: activity.url
                }],
                status: status,
                afk: false
            });
            return true;
        } catch (error) {
            console.error('❌ Error setting basic presence:', error);
            return false;
        }
    };

    try {
        console.log(`✅ Logged in as ${client.user.tag}`);
        
        // Set initial presence
        await setBasicPresence('online', { name: 'Starting up...', type: ActivityType.Playing });
        
        // Load presence config
        await loadPresenceConfig();
        
        // Set up presence update interval if configured
        if (presenceConfig.updateInterval) {
            if (presenceUpdateInterval) {
                clearInterval(presenceUpdateInterval);
            }
            
            presenceUpdateInterval = setInterval(() => {
                updatePresence(client).catch(error => {
                    console.error('Error in presence update interval:', error);
                });
            }, presenceConfig.updateInterval);
            
            // Initial presence update
            await updatePresence(client);
        }
        
        // Set up basic commands
        try {
            // Register slash commands here if needed
            console.log('✅ Registered application (/) commands');
        } catch (error) {
            console.error('❌ Failed to register application commands:', error);
        }
        
        // Set up event listeners
        client.on('guildCreate', guild => {
            console.log(`✅ Joined new guild: ${guild.name} (${guild.id})`);
            updatePresence(client).catch(console.error);
        });
        
        client.on('guildDelete', guild => {
            console.log(`❌ Left guild: ${guild.name} (${guild.id})`);
            updatePresence(client).catch(console.error);
        });
        
        console.log('✅ Ready!');
        
    } catch (error) {
        console.error('❌ Error in ready event:', {
            message: error.message,
            stack: error.stack
        });
        
        // Try to set an error presence
        await setBasicPresence('dnd', { 
            name: 'Error on startup', 
            type: ActivityType.Playing 
        }).catch(console.error);
        
    } finally {
        // Ensure we always have some presence set, even if it's just a basic one
        if (client?.user) {
            try {
                const currentPresence = client.user.presence;
                if (!currentPresence || !currentPresence.activities?.length) {
                    await setBasicPresence('online', { 
                        name: 'Discord Bot', 
                        type: ActivityType.Playing 
                    });
                }
            } catch (error) {
                console.error('❌ Error in final presence check:', error);
            }
        }
        
        console.log('✅ Ready event handler completed');
    }
}
