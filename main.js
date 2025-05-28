/**
 * Main entry point for the Discord bot
 */

// Core dependencies
import path from 'path';
import http from 'http';
import { promises as fs } from 'fs';
import { format } from 'util';
import { fileURLToPath } from 'url';

// Third-party dependencies
import Discord from 'discord.js';
import dotenv from 'dotenv';

// Internal modules
import VCConfig from './utils/vc-config.js';
import { validateConfig, validatePresenceConfig } from './utils/config-validator.js';
import handleReady from './events/ready.js';

// Initialize environment
dotenv.config();

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validates the application configuration
 * @throws {Error} If configuration is invalid
 */
async function validateConfiguration() {
    try {
        // Validate environment variables
        validateConfig();
        
        // Load and validate presence config
        const presenceConfigPath = path.join(__dirname, 'config', 'presence-config.json');
        try {
            const presenceConfigData = await fs.promises.readFile(presenceConfigPath, 'utf8');
            const presenceConfig = JSON.parse(presenceConfigData);
            validatePresenceConfig(presenceConfig);
        } catch (error) {
            console.warn('Warning: Could not validate presence config:', error.message);
            // Continue with default presence config
        }
        
        console.log('✅ Configuration validated successfully');
    } catch (error) {
        console.error('❌ Configuration validation failed:', error.message);
        throw error;
    }
}

// Initialize configuration
const configDir = path.join(__dirname, 'config');
const configManager = new VCConfig(configDir);

// Ensure config directory exists
await fs.mkdir(configDir, { recursive: true }).catch(console.error);

/**
 * Default configuration settings
 */
const DEFAULT_CONFIG = {
    PORT: Number(process.env.PORT) || 8080,
    NODE_ENV: process.env.NODE_ENV || 'development',
    HEARTBEAT_INTERVAL: 5 * 60 * 1000,
    CLIENT_OPTIONS: {
        messageCacheMaxSize: 100,
        messageCacheLifetime: 0,
        messageSweepInterval: 0,
        waitGuildTimeout: 30000,
        allowedMentions: {
            parse: ['users', 'roles'],
            repliedUser: true
        }
    }
};

/**
 * Discord client instance
 */
let discordClient;

// Load bot configuration
let botConfig;
try {
    const configPath = path.join(__dirname, 'config', 'bot-config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    botConfig = JSON.parse(configData);
    console.log('✅ Bot configuration loaded successfully');
} catch (error) {
    console.error('❌ Failed to load bot configuration:', error);
    process.exit(1);
}

/**
 * Creates and configures a new Discord client instance
 * @returns {Promise<Discord.Client>} Configured Discord client
 * @throws {Error} If client creation fails
 */
async function createDiscordClient() {
    try {
        const client = await createConfiguredClient();
        // Attach config to client for easy access
        client.config = {
            botConfig,
            getVCConfig: (guildId) => configManager.getVCConfig(guildId)
        };
        setupClientEvents(client);
        return client;
    } catch (error) {
        console.error('Failed to create Discord client', formatError(error));
        throw error;
    }
}

/**
 * Creates a configured Discord client instance
 * @returns {Promise<Discord.Client>} Configured Discord client
 * @throws {Error} If client configuration fails
 */
async function createConfiguredClient() {
    try {
        const clientConfig = {
            intents: [
                Discord.GatewayIntentBits.Guilds,
                Discord.GatewayIntentBits.GuildVoiceStates,
                Discord.GatewayIntentBits.GuildMessages,
                Discord.GatewayIntentBits.DirectMessages,
                Discord.GatewayIntentBits.GuildMembers,
                Discord.GatewayIntentBits.MessageContent
            ],
            
            partials: [
                Discord.Partials.Message,
                Discord.Partials.Channel,
                Discord.Partials.Reaction,
                Discord.Partials.User,
                Discord.Partials.GuildMember
            ],
            
            presence: {
                status: 'online',
                activities: [{
                    name: 'Ready to help!',
                    type: Discord.ActivityType.Playing
                }],
                afk: false
            },
            
            rest: {
                timeout: 60000,
                retries: 5,
                offset: 0,
                api: 'https://discord.com/api',
                version: '10',
                rejectOnRateLimit: false
            },
            
            ws: {
                large_threshold: 50,
                compress: true,
                properties: {
                    $os: process.platform,
                    $browser: 'discord.js',
                    $device: 'discord.js'
                },
                version: '10'
            },
            
            makeCache: Discord.Options.cacheWithLimits({
                ...Discord.Options.defaultMakeCacheSettings,
                MessageManager: 200,
                GuildMemberManager: 1000,
                UserManager: 1000,
                GuildBanManager: 0,
                GuildEmojiManager: 0,
                GuildInviteManager: 0,
                GuildStickerManager: 0,
                PresenceManager: 0,
                VoiceStateManager: 0,
                ReactionManager: 0,
                ReactionUserManager: 0
            }),
            
            ...DEFAULT_CONFIG.CLIENT_OPTIONS
        };

        const client = new Discord.Client(clientConfig);
        console.log('Discord client created successfully');
        return client;
    } catch (error) {
        console.error('Failed to configure Discord client', formatError(error));
        throw error;
    }
}

/**
 * Sets up client event handlers
 * @param {Discord.Client} client - Discord client instance
 */
function setupClientEvents(client) {
    // Warning handler
    client.on('warn', (warning) => {
        console.warn('Discord.js warning:', warning);
    });

    // Rate limit handler
    client.on('rateLimit', (rateLimitInfo) => {
        console.log('Rate limit hit', {
            timeout: rateLimitInfo.timeout,
            limit: rateLimitInfo.limit,
            method: rateLimitInfo.method,
            path: rateLimitInfo.path,
            route: rateLimitInfo.route,
            global: rateLimitInfo.global || false
        });
    });

    // Set up ready event handler
    client.once('ready', () => handleReady(client).catch(error => {
        console.error('Error in ready handler:', error);
    }));

    // Import and set up voice state update handler
    import('./events/voiceStateUpdate.js').then(({ default: handleVoiceStateUpdate, name: eventName }) => {
        client.on(eventName, handleVoiceStateUpdate);
        console.log(`✅ Registered ${eventName} event handler`);
    }).catch(error => {
        console.error('Failed to load voice state update handler:', error);
    });

    // Error handling
    client.on('error', (error) => {
        console.error('Client error', error);
    });

    // Raw websocket events for debugging in development
    if (process.env.NODE_ENV === 'development') {
        client.on('raw', packet => {
            if (['READY', 'RESUMED', 'GUILD_CREATE', 'MESSAGE_CREATE'].includes(packet.t)) {
                console.log('Raw packet received', packet);
            }
        });
    }
}

/**
 * Logs application startup information
 */
function logStartupInfo() {
    console.log('Startup Info:', {
        env: process.env.NODE_ENV,
        version: process.env.npm_package_version,
        nodeVersion: process.version,
        processId: process.pid,
        uptime: process.uptime()
    });
}

/**
 * Handles client disconnection events
 * @param {CloseEvent} event - The disconnect event
 */
function handleDisconnect(event) {
    console.log('Client disconnected:', event);
    
    // Attempt to reconnect after a short delay
    setTimeout(() => {
        if (discordClient) {
            discordClient.login(process.env.DISCORD_TOKEN);
        }
    }, 5000);
}

/**
 * Handles reconnection attempts
 * @param {Error} error - The error that triggered reconnection
 */
function handleReconnection(error) {
    console.log('Attempting to reconnect...', error);
    
    // Attempt to reconnect
    if (discordClient) {
        discordClient.destroy();
        discordClient = null;
        initialize();
    }
}

/**
 * Main initialization function that orchestrates the bot startup process
 * @async
 * @throws {Error} If any initialization step fails
 * @returns {Promise<void>}
 */
async function initialize() {
    try {
        // Validate configuration
        await validateConfiguration();
        
        // Initialize Discord client
        discordClient = await createDiscordClient();
        
        // Load bot configuration
        const configPath = path.join(__dirname, 'config', 'bot-config.json');
        let botConfig = {};
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            botConfig = JSON.parse(configData);
        } catch (error) {
            console.warn('❌ Failed to load bot config, using defaults:', error.message);
        }

        // Initialize event handlers with config
        try {
            const eventLoader = (await import('./eventloader.js')).default;
            await eventLoader(discordClient, botConfig);
            console.log('✅ Event handlers initialized');
        } catch (error) {
            console.error('❌ Failed to initialize event handlers:', error);
            throw error;
        }
        
        // Start bot
        await startBot();
        
    } catch (error) {
        console.error('Initialization failed', error);
        process.exit(1);
    }
}

/**
 * Attempts to login with exponential backoff
 * @param {Discord.Client} client - Discord client instance
 * @param {string} token - Discord bot token
 * @param {number} [maxAttempts=5] - Maximum number of login attempts
 * @returns {Promise<void>}
 * @throws {Error} If login fails after max attempts
 */
async function loginWithRetry(client, token, maxAttempts = 5) {
    let attempt = 1;
    const baseDelay = 1000;

    while (attempt <= maxAttempts) {
        try {
            await client.login(token);
            return;
        } catch (error) {
            if (attempt === maxAttempts) {
                throw error;
            }

            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`Login attempt ${attempt} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
}

/**
 * Formats an error object for logging
 * @param {Error|any} error - The error to format
 * @returns {Object} Formatted error details
 */
function formatError(error) {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
            name: error.name
        };
    }
    return error;
}

/**
 * Starts the bot and sets up necessary services
 * @returns {Promise<void>}
 */
async function startBot() {
    try {
        // Start keep-alive server
        const server = startKeepAliveServer();
        
        // Set up heartbeat
        setupHeartbeat();
        
        // Login with retry
        await loginWithRetry(discordClient, process.env.DISCORD_TOKEN);
        
        console.log('Bot started successfully');
        
    } catch (error) {
        console.error('Failed to start bot', error);
        throw error;
    }
}

/**
 * Starts a simple HTTP server to keep the process alive
 * @returns {http.Server}
 */
function startKeepAliveServer() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is running');
    });

    server.listen(DEFAULT_CONFIG.PORT, () => {
        console.log(`Keep-alive server running on port ${DEFAULT_CONFIG.PORT}`);
    });

    return server;
}

/**
 * Sets up periodic heartbeat logging
 */
function setupHeartbeat() {
    console.log('Setting up heartbeat');
    
    heartbeatInterval = setInterval(() => {
        if (discordClient && discordClient.user) {
            console.log('Heartbeat status:', {
                guilds: discordClient.guilds.cache.size,
                users: discordClient.users.cache.size,
                channels: discordClient.channels.cache.size,
                uptime: process.uptime()
            });
        }
    }, DEFAULT_CONFIG.HEARTBEAT_INTERVAL);
}

/**
 * Gracefully shuts down the application
 * @param {number} [signal] - Signal that triggered shutdown (optional)
 * @returns {Promise<void>}
 */
async function shutdown(signal) {
    console.log('Shutting down...', { signal });
    
    try {
        // 1. Clean up Discord client
        if (discordClient) {
            await discordClient.destroy();
        }

        // 2. Clean up HTTP server
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => err ? reject(err) : resolve());
            });
        }

        // 3. Wait for active operations to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. Exit process
        process.exit(0);
    } catch (error) {
        const errorMessage = formatError(error);
        console.error(`Shutdown failed: ${errorMessage}`);
        console.error('Attempting emergency shutdown...');
        process.exit(1);
    }
}

// Global error handlers
let keepAliveServer;
let heartbeatInterval;

process.on('unhandledRejection', (reason, promise) => {
    appLogger.error('Unhandled Promise Rejection', {
        reason: formatError(reason),
        promise: promise
    });
        promise: promise
    });

process.on('uncaughtException', (error) => {
    appLogger.error('Uncaught Exception', formatError(error));
    process.exit(1);
});

// Set up signal handlers
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
        shutdown(signal);
    });
});

// Start the bot
initialize();
