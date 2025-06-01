let presenceInterval = null;

const { ActivityType, ActivityFlagsBitField } = require('discord.js');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { validatePresenceConfig } = require('../utils/config-validator');
const logger = require('../utils/logger');

// Define valid presence statuses since PresenceStatus is not directly exported
const VALID_PRESENCE_STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const VALID_STATUSES = ['online', 'idle', 'dnd', 'invisible'];

let version = '1.0.0';
try {
    const packageJson = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
    version = JSON.parse(packageJson).version;
} catch (error) {
    logger.error('Error reading package.json:', error);
}

const PRESENCE_CONFIG_PATH = path.join(process.cwd(), 'config', 'presence-config.json');
const PRESENCE_CONFIG_DIR = path.dirname(PRESENCE_CONFIG_PATH);

const DEFAULT_PRESENCE = {
    status: 'online',
    activities: [
        {
            name: '{guilds} servers | {prefix}help',
            type: 'WATCHING',
            url: null
        },
        {
            name: 'with {users} users',
            type: 'PLAYING',
            url: null
        },
        {
            name: 'v{version}',
            type: 'PLAYING',
            url: null
        },
        {
            name: '{prefix}help',
            type: 'WATCHING',
            url: null
        }
    ],
    rotation: {
        enabled: true,
        interval: 300000,
        randomize: true,
        currentIndex: 0
    },
    messages: {
        prefix: '!',
        version: version || '1.0.0',
        templates: {
            guilds: '{guilds} servers',
            users: '{users} users',
            version: 'v{version}'
        }
    },
    guildOverrides: {}
};

let currentPresence = { ...DEFAULT_PRESENCE };
let presenceLock = false;
let isUpdating = false;
let activityQueue = [];
let rotationInterval = null;




const DEFAULT_ACTIVITY = {
    name: 'Discord.js v14',
    type: ActivityType.Playing
};


function formatStatus(text, client, options = {}) {
    if (!text || !client) return text || '';

    try {
        const guilds = client.guilds?.cache?.size || 0;
        const users = client.guilds?.cache?.reduce((acc, guild) => acc + (guild.memberCount || 0), 0) || 0;
        const prefix = options.prefix || currentPresence.messages?.prefix || '!';
        const version = options.version || currentPresence.messages?.version || '1.0.0';

        const replacements = {
            '{prefix}': prefix,
            '{version}': version,
            '{guilds}': guilds.toString(),
            '{users}': users.toString(),
            // Add custom template replacements from config
            ...(currentPresence.messages?.templates || {})
        };

        // Replace all template variables
        return Object.entries(replacements).reduce(
          (str, [key, value]) => str.replace(new RegExp(key, 'g'), value),
          String(text)
        );
    } catch (error) {
        logger.error('Error formatting status:', error);
        return text || '';
    }
}


async function loadPresenceConfig() {
    try {
        logger.info('🔄 Loading presence configuration...');
        let loadedConfig = null;

        // Ensure config directory exists
        try {
            if (!fs.existsSync(PRESENCE_CONFIG_DIR)) {
                fs.mkdirSync(PRESENCE_CONFIG_DIR, { recursive: true });
                logger.debug('✅ Config directory created');
            } else {
                logger.debug('✅ Config directory already exists');
            }
        } catch (dirError) {
            logger.error('❌ Failed to create config directory:', dirError);
            throw new Error(`Failed to create config directory: ${dirError.message}`);
        }

        // Try to read and parse the config file
        try {
            if (fs.existsSync(PRESENCE_CONFIG_PATH)) {
                logger.debug(`📂 Reading config from: ${PRESENCE_CONFIG_PATH}`);
                const configData = fs.readFileSync(PRESENCE_CONFIG_PATH, 'utf8');
                loadedConfig = JSON.parse(configData);
                logger.debug('✅ Successfully parsed presence config');
            } else {
                logger.warn('⚠️  No presence config found, using defaults');
                loadedConfig = { ...DEFAULT_PRESENCE };
                // Save default config for next time
                fs.writeFileSync(
                    PRESENCE_CONFIG_PATH,
                    JSON.stringify(loadedConfig, null, 2) + '\n',
                    { encoding: 'utf8' }
                );
                logger.info('✅ Created default presence configuration');
            }
        } catch (error) {
            logger.error('❌ Error loading presence config:', error);
            loadedConfig = { ...DEFAULT_PRESENCE };
            logger.warn('⚠️  Using default presence configuration due to error');
        }

        // Ensure we have a valid config object
        if (!loadedConfig || typeof loadedConfig !== 'object') {
            logger.warn('⚠️  Invalid config format, using defaults');
            loadedConfig = { ...DEFAULT_PRESENCE };
        }

        // Ensure activities array exists and is valid
        if (!Array.isArray(loadedConfig.activities) || loadedConfig.activities.length === 0) {
            logger.warn('⚠️  No valid activities found, using defaults');
            loadedConfig.activities = [...DEFAULT_PRESENCE.activities];
        } else {
            // Clean up activities
            loadedConfig.activities = loadedConfig.activities
                .filter(activity => activity && activity.name && activity.type)
                .map(activity => ({
                    name: activity.name,
                    type: activity.type.toUpperCase(),
                    url: activity.url || null
                }));

            if (loadedConfig.activities.length === 0) {
                logger.warn('⚠️  No valid activities after cleanup, using defaults');
                loadedConfig.activities = [...DEFAULT_PRESENCE.activities];
            }
        }


        // Ensure updateInterval is valid
        if (typeof loadedConfig.updateInterval !== 'number' || loadedConfig.updateInterval < 15000) {
            logger.warn('⚠️  Invalid updateInterval, using default (60s)');
            loadedConfig.updateInterval = 60000; // 1 minute
        }

        // Ensure status is valid
        if (!VALID_PRESENCE_STATUSES.includes(loadedConfig.status)) {
            logger.warn(`⚠️  Invalid status '${loadedConfig.status}', using 'online'`);
            loadedConfig.status = 'online';
        }

        // Update current presence
        currentPresence = { ...DEFAULT_PRESENCE, ...loadedConfig };
        
        // Ensure rotation settings exist
        if (!currentPresence.rotation || typeof currentPresence.rotation !== 'object') {
            currentPresence.rotation = { ...DEFAULT_PRESENCE.rotation };
        }

        logger.info('✅ Successfully loaded presence configuration');
        return true;

    } catch (error) {
        logger.error('❌ Critical error in loadPresenceConfig:', error);
        
        // Fall back to default config
        currentPresence = { ...DEFAULT_PRESENCE };
        logger.warn('⚠️  Falling back to default presence configuration');

        // Try to save the default config for next time
        try {
            fs.writeFileSync(
                PRESENCE_CONFIG_PATH,
                JSON.stringify(DEFAULT_PRESENCE, null, 2) + '\n',
                { encoding: 'utf8' }
            );
        } catch (writeError) {
            logger.error('❌ Failed to save default presence config:', writeError);
        }

        return false;
    }
}

function deepMerge(target, source) {
    const output = { ...target };

    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    output[key] = source[key];
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else if (Array.isArray(source[key])) {
                output[key] = [...(target[key] || []), ...source[key]];
            } else {
                output[key] = source[key];
            }
        });
    }

    return output;
}

/**
 * Checks if a value is a plain object
 * @param {any} obj - The value to check
 * @returns {boolean} True if the value is a plain object
 */
/**
 * Checks if a value is a plain object
 * @param {any} obj - The value to check
 * @returns {boolean} True if the value is a plain object
 */
function isObject(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * Gets the next activity to display based on rotation settings
 * @param {import('discord.js').Client} client - The Discord.js client instance
 * @param {Object} [options={}] - Additional options
 * @returns {Object} The next activity configuration
 */
/**
 * Gets the next activity to display based on rotation settings
 * @param {import('discord.js').Client} client - The Discord.js client instance
 * @param {Object} [options={}] - Additional options
 * @returns {Object} The next activity configuration
 */
function getNextActivity(client, options = {}) {
    const { config = {} } = options;
    const { activities = [], rotation = {} } = config;
    const { enabled = true, randomize = true, currentIndex = 0 } = rotation;

    if (!activities || activities.length === 0) {
        logger.warn('[getNextActivity] No activities found in config, using default');
        return { 
            name: 'Discord Bot',
            type: 'PLAYING',
            status: 'online'
        };
    }

    let nextIndex = currentIndex;
    let nextActivity;

    if (enabled && activities.length > 1) {
        if (randomize) {
            // Get a random index different from current if possible
            do {
                nextIndex = Math.floor(Math.random() * activities.length);
            } while (activities.length > 1 && nextIndex === currentIndex);
        } else {
            nextIndex = (currentIndex + 1) % activities.length;
        }
    }

    // Get the selected activity
    nextActivity = { ...activities[nextIndex] };
    
    // Ensure required fields
    if (!nextActivity.type) {
        nextActivity.type = 'PLAYING';
    }
    if (!nextActivity.status) {
        nextActivity.status = 'online';
    }

    logger.debug(`[getNextActivity] Selected activity: ${JSON.stringify(nextActivity)}`);
    return nextActivity;
}


const ACTIVITY_TYPE_MAP = {
    
    'PLAYING': ActivityType.Playing,
    'STREAMING': ActivityType.Streaming,
    'LISTENING': ActivityType.Listening,
    'WATCHING': ActivityType.Watching,
    'COMPETING': ActivityType.Competing,
    'CUSTOM': ActivityType.Custom,

    // Numeric types (for backward compatibility)
    '0': ActivityType.Playing,
    '1': ActivityType.Streaming,
    '2': ActivityType.Listening,
    '3': ActivityType.Watching,
    '4': ActivityType.Competing,
    '5': ActivityType.Custom
};

function getActivityType(type) {
    if (type === undefined || type === null) {
        return ActivityType.Playing;
    }

    const typeStr = String(type).toUpperCase();
    return ACTIVITY_TYPE_MAP[typeStr] || ActivityType.Playing;
}

async function updatePresence(client, options = {}) {
    const startTime = Date.now();
    const logPrefix = '[Presence]';
    
    // Validate client and user first before any operations
    if (!client) {
        logger.error(`${logPrefix} Cannot update presence: Client is null or undefined`);
        return false;
    }
    
    logger.debug(`${logPrefix} Starting presence update with options: ${JSON.stringify(options)}`);
    
    // Safely check client properties
    const isClientReady = client.isReady && typeof client.isReady === 'function' ? client.isReady() : false;
    const isUserAvailable = !!(client.user);
    
    logger.debug(`${logPrefix} Client ready state: ${isClientReady ? 'ready' : 'not ready'}`);
    logger.debug(`${logPrefix} Client user available: ${isUserAvailable}`);

    // Validate client user
    if (!isUserAvailable) {
        logger.error(`${logPrefix} Cannot update presence: client.user is not available`);
        return false;
    }

    // Handle concurrent updates with a queue
    if (isUpdating) {
        logger.debug(`${logPrefix} Update already in progress, queuing request`);
        return new Promise((resolve, reject) => {
            activityQueue.push(() => updatePresence(client, options).then(resolve).catch(reject));
        });
    }

    isUpdating = true;

    try {
        // Load the latest presence config
        const presenceConfig = await loadPresenceConfig();
        
        logger.debug(`${logPrefix} Current presence config: ${JSON.stringify({
            activities: (presenceConfig.activities || []).map(a => ({
                name: a.name,
                type: a.type,
                url: a.url ? 'has_url' : null
            })),
            rotation: presenceConfig.rotation,
            status: presenceConfig.status
        }, null, 2)}`);

        // Get the next activity to display
        logger.debug(`${logPrefix} Getting next activity...`);
        const activity = getNextActivity(client, { ...options, config: presenceConfig });
        if (!activity || !activity.name) {
            throw new Error('No valid activities configured in presence config');
        }

        // Ensure activity type is valid
        if (activity.type === undefined) {
            activity.type = 'PLAYING';
            logger.warn(`${logPrefix} Activity type not specified, defaulting to PLAYING`);
        }

        // Prepare default template variables
        const guilds = client.guilds.cache.size;
        const users = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
        const defaultMessages = {
            prefix: currentPresence.messages?.prefix || '!',
            version: version,
            guilds: guilds.toString(),
            users: users.toString()
        };

        // Format the activity name with dynamic variables
        logger.debug(`${logPrefix} Formatting activity name...`);
        let formattedName;
        try {
            formattedName = formatStatus(
              activity.name,
              client,
              {
                  ...defaultMessages,
                  ...options
              }
            );

            if (!formattedName || typeof formattedName !== 'string') {
                throw new Error(`Invalid formatted activity name: ${formattedName}`);
            }

            // Truncate if too long (Discord limit is 128 characters)
            if (formattedName.length > 128) {
                logger.warn(`${logPrefix} Activity name too long (${formattedName.length} chars), truncating`);
                formattedName = formattedName.substring(0, 125) + '...';
            }

        } catch (formatError) {
            logger.error(`${logPrefix} Error formatting activity name:`, formatError);
            // Fall back to a safe default
            formattedName = `v${version} | ${guilds} servers`;
        }

        // Determine status (from options, current presence, or default)
        const status = options.forceStatus && VALID_PRESENCE_STATUSES.includes(options.forceStatus)
          ? options.forceStatus
          : (VALID_PRESENCE_STATUSES.includes(currentPresence.status)
            ? currentPresence.status
            : 'online');

        // Get activity type with fallback
        let activityType;
        try {
            activityType = getActivityType(activity.type);
            if (activityType === undefined) {
                throw new Error(`Invalid activity type: ${activity.type}`);
            }
        } catch (typeError) {
            logger.warn(`${logPrefix} ${typeError.message}, defaulting to PLAYING`);
            activityType = ActivityType.Playing;
        }

        // Prepare presence data
        const presenceData = {
            activities: [{
                name: formattedName,
                type: activityType,
                url: activity.url || undefined
            }],
            status,
            afk: false
        };

        // Log the update (without sensitive data)
        const logData = {
            name: formattedName,
            type: ActivityType[activityType] || activityType,
            status,
            activityType: activity.type,
            activityTypeId: activityType,
            hasUrl: !!activity.url,
            guilds: guilds,
            users: users
        };

        logger.info(`${logPrefix} Updating presence: ${JSON.stringify(logData, null, 2)}`);

        // Apply the presence update with timeout
        const updatePromise = client.user.setPresence(presenceData);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Presence update timed out')), 5000)
        );

        try {
            await Promise.race([updatePromise, timeoutPromise]);
            const duration = Date.now() - startTime;
            logger.info(`${logPrefix} Successfully updated presence in ${duration}ms`);
            return true;

        } catch (updateError) {
            logger.error(`${logPrefix} Failed to update presence:`, updateError);

            // Try a simpler presence update as fallback
            try {
                logger.warn(`${logPrefix} Attempting fallback presence update...`);
                await client.user.setPresence({
                    activities: [{
                        name: `v${version} | ${guilds} servers`,
                        type: ActivityType.Playing
                    }],
                    status: 'online'
                });
                logger.info(`${logPrefix} Fallback presence update succeeded`);
                return true;
            } catch (fallbackError) {
                logger.error(`${logPrefix} Fallback presence update failed:`, fallbackError);
                throw new Error(`All presence update attempts failed: ${updateError.message}`);
            }
        }

    } catch (error) {
        logger.error(`${logPrefix} Error in updatePresence:`, error);
        return false;

    } finally {
        isUpdating = false;

        // Process the next queued update if any
        if (activityQueue.length > 0) {
            const nextUpdate = activityQueue.shift();
            if (typeof nextUpdate === 'function') {
                logger.debug(`${logPrefix} Processing next queued update`);
                nextUpdate().catch(err =>
                  logger.error(`${logPrefix} Error in queued update:`, err)
                );
            }
        }
    }
};

async function startPresenceRotation(client) {
    const logPrefix = '[PresenceRotation]';
    let presenceConfig;

    // Validate client and user
    if (!client) {
        logger.error(`${logPrefix} Client is not defined`);
        return false;
    }
    
    if (!client.user) {
        logger.error(`${logPrefix} Client user is not available (bot may not be fully initialized)`);
        return false;
    }
    
    if (!client.isReady()) {
        logger.warn(`${logPrefix} Client is not in ready state, presence updates may fail`);
    }

    try {
        // Load the latest presence config
        presenceConfig = await loadPresenceConfig();
        if (!presenceConfig) {
            throw new Error('Failed to load presence configuration');
        }
    } catch (error) {
        logger.error(`${logPrefix} Error loading presence config:`, error);
        return false;
    }

    // Clear any existing interval
    if (presenceInterval) {
        logger.debug(`${logPrefix} Clearing existing rotation interval`);
        clearInterval(presenceInterval);
        presenceInterval = null;
    }

    // Get rotation settings with defaults
    const { rotation = {}, activities = [] } = presenceConfig;

    // Ensure we have a valid update interval (minimum 30 seconds, default 5 minutes)
    const minInterval = 30000; // 30 seconds
    const defaultInterval = 300000; // 5 minutes
    const configInterval = typeof rotation.interval === 'number' ? rotation.interval : defaultInterval;
    const interval = Math.max(minInterval, configInterval);

    // Check if rotation is enabled
    if (rotation.enabled === false) {
        logger.info(`${logPrefix} Rotation is disabled in config`);
        return false;
    }

    // Validate activities
    if (!Array.isArray(activities) || activities.length === 0) {
        logger.warn(`${logPrefix} No activities configured, cannot start rotation`);
        return false;
    }

    // Log rotation settings
    logger.info(`${logPrefix} Starting with settings:`, {
        interval: `${interval}ms`,
        activityCount: activities.length,
        randomize: !!rotation.randomize,
        currentIndex: rotation.currentIndex || 0
    });

    const initialUpdate = async () => {
        try {
            logger.debug(`${logPrefix} Running initial presence update`);
            const success = await updatePresence(client, { config: presenceConfig });
            if (!success) {
                throw new Error('Initial presence update failed');
            }
        } catch (error) {
            logger.error(`${logPrefix} Initial presence update failed:`, error);

            // If initial update fails, retry with exponential backoff
            const maxRetries = 3;
            let retryCount = 0;

            const retryUpdate = async () => {
                if (retryCount >= maxRetries) {
                    logger.error(`${logPrefix} Max retries (${maxRetries}) reached for initial presence update`);
                    return;
                }


                retryCount++;
                const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30s delay

                logger.warn(`${logPrefix} Retrying initial update in ${delay}ms (attempt ${retryCount}/${maxRetries})`);

                setTimeout(async () => {
                    try {
                        const success = await updatePresence(client);
                        if (!success) {
                            throw new Error('Presence update failed');
                        }
                        logger.info(`${logPrefix} Successfully updated presence after ${retryCount} ${retryCount === 1 ? 'retry' : 'retries'}`);
                    } catch (retryError) {
                        logger.error(`${logPrefix} Retry ${retryCount} failed:`, retryError);
                        retryUpdate(); // Continue retrying
                    }
                }, delay);
            };

            retryUpdate();
        }
    };

    // Run the initial update
    try {
        await initialUpdate();
    } catch (error) {
        logger.error(`${logPrefix} Initial update failed:`, error);
    }

    const rotationTask = async () => {
        try {
            logger.debug(`${logPrefix} Running scheduled presence update`);
            
            // Reload config to get any updates
            const currentConfig = await loadPresenceConfig().catch(err => {
                logger.error(`${logPrefix} Failed to reload config:`, err);
                return presenceConfig; // Fall back to the last known good config
            });
            
            const success = await updatePresence(client, { 
                config: currentConfig || presenceConfig,
                skipRotation: false 
            });
            
            if (!success) {
                throw new Error('Scheduled presence update failed');
            }
        } catch (error) {
            logger.error(`${logPrefix} Scheduled presence update failed:`, error);

            // If scheduled update fails, try to recover with a basic presence
            try {
                logger.warn(`${logPrefix} Attempting to recover presence...`);
                await setBasicPresence(client, {
                    name: `v${version} | ${client.guilds.cache.size} servers`,
                    type: 'PLAYING',
                    status: 'online'
                });
            } catch (recoveryError) {
                logger.error(`${logPrefix} Failed to recover presence:`, recoveryError);
            }
        }
    };

    // Start the rotation interval with error handling
    try {
        presenceInterval = setInterval(rotationTask, interval);
        if (!presenceInterval) {
            throw new Error('Failed to create interval');
        }
    } catch (error) {
        logger.error(`${logPrefix} Failed to start presence rotation interval:`, error);
        return false;
    }

    // Store rotation info for monitoring
    const rotationInfo = {
        startedAt: new Date(),
        interval: interval,
        activityCount: presenceConfig.activities?.length || 0,
        nextRotation: new Date(Date.now() + interval)
    };

    logger.info(`${logPrefix} Started successfully`, {
        interval: `${interval}ms`,
        nextRotation: rotationInfo.nextRotation.toISOString(),
        activityCount: rotationInfo.activityCount
    });

    return true;
}

function stopPresenceRotation() {
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
        logger.info('Stopped presence rotation');
    }
}

async function setBasicPresence(client, options = {}) {
    const logPrefix = '[setBasicPresence]';
    const startTime = Date.now();
    
    try {
        logger.debug(`${logPrefix} Starting with options: ${JSON.stringify(options)}`);
        
        if (!client) {
            throw new Error('Client is not defined');
        }

        if (!client.user) {
            throw new Error('Client user is not available');
        }
        
        logger.debug(`${logPrefix} Client ready state: ${client.isReady() ? 'ready' : 'not ready'}`);
        logger.debug(`${logPrefix} Client user: ${client.user.tag} (${client.user.id})`);

        const {
            status = 'online',
            name = 'Discord Bot',
            type = 'PLAYING',
            url
        } = options;

        // Validate and log the input options
        logger.debug(`${logPrefix} Processing presence options:`, {
            status,
            name: name ? `${name.substring(0, 20)}${name.length > 20 ? '...' : ''}` : 'empty',
            type,
            hasUrl: !!url
        });

        // Validate status is one of the allowed values
        const validStatus = VALID_PRESENCE_STATUSES.includes(status) ? status : 'online';
        const activityType = getActivityType(type);

        // Prepare presence data with validation
        const presenceData = {
            activities: [{
                name: String(name || 'Discord Bot').substring(0, 128),
                type: activityType,
                url: url || undefined
            }],
            status: validStatus,
            afk: false
        };
        
        // Log the presence data we're about to set
        logger.debug(`${logPrefix} Setting presence with data:`, JSON.stringify({
            activities: [{
                name: presenceData.activities[0].name,
                type: ActivityType[presenceData.activities[0].type] || presenceData.activities[0].type,
                url: presenceData.activities[0].url ? 'has_url' : null
            }],
            status: presenceData.status,
            afk: presenceData.afk
        }, null, 2));
        
        // Set the presence with a timeout
        const presencePromise = client.user.setPresence(presenceData);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Presence update timed out after 5s')), 5000)
        );
        
        await Promise.race([presencePromise, timeoutPromise]);
        
        // Verify the presence was set
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for presence to update
        
        const currentPresence = client.user.presence;
        const presenceInfo = {
            status: currentPresence?.status,
            activities: currentPresence?.activities?.map(a => ({
                name: a.name,
                type: ActivityType[a.type] || a.type,
                state: a.state,
                url: a.url ? 'has_url' : null
            }))
        };
        
        logger.debug(`${logPrefix} Current presence after update:`, JSON.stringify(presenceInfo, null, 2));
        
        if (!currentPresence?.activities?.length) {
            throw new Error('Failed to verify presence was set - no activities found');
        }
        
        const duration = Date.now() - startTime;
        logger.info(`${logPrefix} Successfully set presence in ${duration}ms: ${name} (${ActivityType[activityType] || activityType})`);
        return true;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`${logPrefix} Failed to set presence after ${duration}ms:`, error);
        
        // Try a simpler presence as fallback
        try {
            if (client?.user) {
                logger.warn(`${logPrefix} Attempting fallback presence...`);
                await client.user.setPresence({
                    activities: [{
                        name: 'Discord Bot',
                        type: ActivityType.Playing
                    }],
                    status: 'online'
                });
                logger.info(`${logPrefix} Fallback presence set successfully`);
                return true;
            }
        } catch (fallbackError) {
            logger.error(`${logPrefix} Fallback presence also failed:`, fallbackError);
        }
        return false;
    }
}



async function handleReady(client) {
    const logPrefix = '[handleReady]';
    try {
        logger.info(`${logPrefix} Logged in as ${client.user.tag} (${client.user.id})`);

        // Log client user info for debugging
        logger.debug(`${logPrefix} Client user info:`, {
            id: client.user.id,
            tag: client.user.tag,
            bot: client.user.bot,
            createdAt: client.user.createdAt,
            readyAt: client.readyAt,
            readyTimestamp: client.readyTimestamp,
            uptime: client.uptime,
            ws: {
                status: client.ws.status,
                ping: client.ws.ping,
                reconnecting: client.ws.reconnecting,
                readyAt: client.ws.readyAt
            }
        });
        
        logger.debug(`${logPrefix} Client ready state: ${client.isReady() ? 'ready' : 'not ready'}`);

        // Set initial presence
        logger.info(`${logPrefix} 1. Setting initial presence...`);
        try {
            logger.debug(`${logPrefix} Current presence before initial set: ${JSON.stringify(client.user.presence, null, 2)}`);
            const presenceResult = await setBasicPresence(client, {
                status: 'online',
                name: 'Starting up...',
                type: 'PLAYING'
            });
            
            if (!presenceResult) {
                throw new Error('setBasicPresence returned false');
            }
            
            // Verify the presence was actually set
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit for presence to update
            logger.debug(`${logPrefix} Current presence after initial set: ${JSON.stringify(client.user.presence, null, 2)}`);
            
            if (!client.user.presence.activities || client.user.presence.activities.length === 0) {
                throw new Error('Failed to set initial presence: No activities found');
            }
            
            logger.info('✅ Initial presence set successfully');
        } catch (error) {
            logger.error('❌ Failed to set initial presence:', error);
            throw error; // Re-throw to be caught by the outer try-catch
        }

        // Load presence configuration
        logger.info('2. Loading presence configuration...');
        try {
            const configLoaded = await loadPresenceConfig();
            if (!configLoaded) {
                logger.warn('❌ Failed to load presence configuration, using defaults');
            } else {
                logger.info('✅ Presence configuration loaded successfully');
            }
            
            // Log current presence config for debugging
            logger.debug('Current presence config:', JSON.stringify({
                status: currentPresence.status || 'online',
                activities: (currentPresence.activities || []).length,
                rotation: currentPresence.rotation?.enabled ? 'enabled' : 'disabled',
                rotationInterval: currentPresence.rotation?.interval || 'N/A'
            }, null, 2));
            
        } catch (error) {
            logger.error('❌ Error loading presence config:', error);
            // Continue with default config
            currentPresence = { ...DEFAULT_PRESENCE };
            logger.warn('⚠️  Using default presence configuration due to error');
        }

        // Start presence rotation if enabled
        if (currentPresence.rotation?.enabled) {
            logger.info('Starting presence rotation...');
            const rotationStarted = await startPresenceRotation(client);
            if (rotationStarted) {
                logger.info(`Started presence rotation with ${(currentPresence.activities || []).length} activities`);
            } else {
                logger.warn('Failed to start presence rotation, falling back to static presence');
                await updatePresence(client, {
                    status: currentPresence.status || 'online',
                    activities: currentPresence.activities || []
                });
            }
        } else {
            logger.info('Presence rotation is disabled, setting initial presence');
            const success = await updatePresence(client);
            if (!success) {
                logger.error('Initial presence update failed, attempting fallback');
                await setBasicPresence(client, {
                    status: 'online',
                    name: 'Discord Bot',
                    type: 'PLAYING'
                });
            }
        }

        // Set up event listeners
        client.on('guildCreate', guild => {
            logger.info(`Joined new guild: ${guild.name} (${guild.id})`);
            updatePresence(client).catch(error => {
                logger.error('Error updating presence after guild join:', error);
            });
        });

        client.on('guildDelete', guild => {
            logger.info(`Left guild: ${guild.name} (${guild.id})`);
            updatePresence(client).catch(error => {
                logger.error('Error updating presence after guild leave:', error);
            });
        });

        logger.info('Bot is ready and listening for events');

    } catch (error) {
        logger.error('Error in ready event handler:', {
            message: error.message,
            stack: error.stack
        });

        // Try to set an error presence
        await setBasicPresence(client, {
            status: 'dnd',
            name: 'Error on startup',
            type: 'PLAYING'
        }).catch(logger.error);

    } finally {
        // Ensure we always have some presence set
        if (client?.user) {
            try {
                const currentPresence = client.user.presence;
                if (!currentPresence || !currentPresence.activities?.length) {
                    await setBasicPresence(client, {
                        name: 'Discord Bot',
                        type: 'PLAYING'
                    });
                }
            } catch (error) {
                logger.error('Error in final presence check:', error);
            }
        }

        logger.info('Ready event handler completed');
    }
}

// Export the main ready event handler with required properties
module.exports = {
  name: 'ready',
  once: true,
  execute: handleReady,
  // Export additional utility functions as properties
  setBasicPresence,
  updatePresence,
  startPresenceRotation,
  stopPresenceRotation,
  loadPresenceConfig,
  formatStatus
};
