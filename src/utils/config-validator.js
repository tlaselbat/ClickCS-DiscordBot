/**
 * Validates the application configuration
 * @throws {Error} If configuration is invalid
 */
function validateConfig() {
    const requiredEnvVars = [
        'DISCORD_TOKEN',
        'CLIENT_ID',
        'GUILD_ID'
    ];

    const missingVars = requiredEnvVars.filter(key => !process.env[key]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Validate DISCORD_TOKEN format (starts with a letter and has at least 2 dots)
    if (process.env.DISCORD_TOKEN && !/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(process.env.DISCORD_TOKEN)) {
        throw new Error('Invalid DISCORD_TOKEN format');
    }

    // Validate NODE_ENV if set
    if (process.env.NODE_ENV && !['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
        throw new Error('NODE_ENV must be one of: development, production, test');
    }
}

/**
 * Validates the presence configuration
 * @param {Object} config - The presence configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validatePresenceConfig(config) {
    if (!config) {
        throw new Error('Presence configuration is required');
    }

    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    if (config.status && !validStatuses.includes(config.status)) {
        throw new Error(`Invalid status: ${config.status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (config.activities && !Array.isArray(config.activities)) {
        throw new Error('Activities must be an array');
    }

    // Map of numeric activity types to their string equivalents
    const activityTypeMap = {
        0: 'PLAYING',
        1: 'STREAMING',
        2: 'LISTENING',
        3: 'WATCHING',
        4: 'COMPETING',
        5: 'CUSTOM',
        PLAYING: 'PLAYING',
        STREAMING: 'STREAMING',
        LISTENING: 'LISTENING',
        WATCHING: 'WATCHING',
        COMPETING: 'COMPETING',
        CUSTOM: 'CUSTOM'
    };

    if (config.activities) {
        if (!Array.isArray(config.activities)) {
            throw new Error('Activities must be an array');
        }

        config.activities.forEach((activity, index) => {
            if (!activity || typeof activity !== 'object') {
                throw new Error(`Activity at index ${index} must be an object`);
            }

            if (!activity.name) {
                throw new Error(`Activity at index ${index} is missing required property: name`);
            }

            // Convert numeric type to string if needed
            if (activity.type !== undefined) {
                const typeStr = activity.type.toString();
                if (!(typeStr in activityTypeMap)) {
                    throw new Error(`Invalid activity type at index ${index}: ${activity.type}. Must be one of: ${Object.keys(activityTypeMap).join(', ')}`);
                }
                // Convert to string type for consistency
                activity.type = activityTypeMap[typeStr];
            }
        });
    }
}

module.exports = {
    validateConfig,
    validatePresenceConfig
};
