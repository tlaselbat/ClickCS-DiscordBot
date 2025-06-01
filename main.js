/**
 * Main entry point for the ClickCS Discord Bot
 */

// Core dependencies
const path = require('path');
const fs = require('fs').promises;

// Third-party dependencies
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const dotenv = require('dotenv');

// Internal modules
const logger = require('./src/utils/logger');
const { config } = require('./src/utils/config');
const VCConfig = require('./src/utils/vc-config');
const commandHandler = require('./src/handlers/commandHandler');

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
    if (logger && logger.error) {
        logger.error('Unhandled Rejection at:', { promise, reason });
    }
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error);
    if (logger && logger.error) {
        logger.error('Uncaught Exception:', error);
    }
});

// Initialize environment
dotenv.config();

// In CommonJS, __filename and __dirname are already defined

// Global application state
const appState = {
    client: null,
    commands: commandHandler, // Use the command handler
    vcConfig: null,
    shuttingDown: false
};

/**
 * Loads all commands from the commands directory
 */
/**
 * Recursively gets all command files from a directory
 * @param {string} dirPath - Directory to search for command files
 * @returns {Promise<string[]>} Array of file paths
 */
async function getAllCommandFiles(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        let commandFiles = [];
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Recursively get files from subdirectories
                const subDirFiles = await getAllCommandFiles(fullPath);
                commandFiles = commandFiles.concat(subDirFiles);
            } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
                commandFiles.push(fullPath);
            }
        }
        
        return commandFiles;
    } catch (error) {
        console.error(`❌ Error scanning directory ${dirPath}:`, error);
        throw error;
    }
}

/**
 * Loads all commands from the commands directory
 */
async function loadCommands() {
    console.log('\n📦 Loading commands...');
    const startTime = Date.now();
    
    try {
        const commandsPath = path.join(__dirname, 'src', 'commands');
        console.log(`🔍 Looking for commands in: ${commandsPath}`);
        
        // Check if directory exists
        try {
            await fs.access(commandsPath);
            console.log('✅ Commands directory exists');
        } catch (err) {
            const errorMsg = `❌ Commands directory not found at ${commandsPath}`;
            console.error(errorMsg);
            throw new Error(`${errorMsg}. Please ensure the 'src/commands' directory exists.`);
        }
        
        // Get all command files recursively
        console.log('🔄 Scanning for command files...');
        const commandFiles = await getAllCommandFiles(commandsPath);
        
        if (commandFiles.length === 0) {
            console.warn('⚠️  No command files found. The bot will not have any commands.');
            return;
        }
        
        console.log(`📂 Found ${commandFiles.length} command files`);
        
        // Counter for successful and failed loads
        let loadedCount = 0;
        let failedCount = 0;
        const loadErrors = [];

        // Load each command file
        for (const filePath of commandFiles) {
            const relativePath = path.relative(process.cwd(), filePath);
            
            try {
                console.log(`\n🔄 Loading: ${relativePath}`);
                
                // Use require() to load the command file
                delete require.cache[require.resolve(filePath)]; // Clear cache to allow hot-reloading
                const command = require(filePath);
                
                if (!command) {
                    const errorMsg = `No export found in ${relativePath}`;
                    console.warn(`⚠️  ${errorMsg}`);
                    loadErrors.push({ file: relativePath, error: errorMsg });
                    failedCount++;
                    continue;
                }
                
                // Validate command structure
                if (!('data' in command) || !('execute' in command)) {
                    const errorMsg = 'Command is missing required "data" or "execute" property';
                    console.warn(`⚠️  ${errorMsg}: ${relativePath}`);
                    loadErrors.push({ file: relativePath, error: errorMsg });
                    failedCount++;
                    continue;
                }
                
                // Add command to the collection
                appState.commands.set(command.data.name, command);
                console.log(`✅ Successfully loaded command: ${command.data.name}`);
                loadedCount++;
                
            } catch (error) {
                console.error(`❌ Error loading command from ${relativePath}:`, error);
                loadErrors.push({ 
                    file: relativePath, 
                    error: error.message,
                    stack: error.stack 
                });
                failedCount++;
            }
        }
        
        // Log summary
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('\n📊 Command Loading Summary:');
        console.log(`⏱️  Loaded in ${loadTime}s`);
        console.log(`✅ Successfully loaded: ${loadedCount} commands`);
        
        if (failedCount > 0) {
            console.warn(`⚠️  Failed to load: ${failedCount} commands`);
            console.log('\n❌ Failed command details:');
            loadErrors.forEach((err, index) => {
                console.log(`\n${index + 1}. ${err.file}`);
                console.log(`   Error: ${err.error}`);
                if (err.stack) {
                    console.log(`   Stack: ${err.stack.split('\n')[0]}`);
                }
            });
        }
        
        if (loadedCount === 0) {
            const errorMsg = 'No commands were successfully loaded. The bot may not function as expected.';
            console.error(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        console.log('\n🎉 Command loading completed!');
        
    } catch (error) {
        console.error('\n❌ Fatal error in loadCommands:', error);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        throw error;
    }
}

/**
 * Registers application commands with Discord
 */
async function registerCommands() {
    try {
        if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
            throw new Error('Missing required environment variables: DISCORD_TOKEN and CLIENT_ID are required');
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const commands = [];

        // Prepare the commands array with proper JSON structure
        for (const [_, command] of appState.commands) {
            if (command.data && typeof command.data.toJSON === 'function') {
                commands.push(command.data.toJSON());
            } else if (command.data && command.data.name) {
                // Handle case where data is already an object
                commands.push(command.data);
            } else {
                logger.warn(`Skipping command with invalid data structure: ${command.data?.name || 'unknown'}`);
            }
        }

        if (commands.length === 0) {
            throw new Error('No valid commands to register');
        }

        // Register commands for all guilds
        const route = process.env.GUILD_ID 
            ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            : Routes.applicationCommands(process.env.CLIENT_ID);
        
        // Convert BigInt to string to avoid serialization issues
        const serializedCommands = JSON.parse(JSON.stringify(commands, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value
        ));

        // logger.info('Registering commands with route:', route);
        const data = await rest.put(route, { 
            body: serializedCommands,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        logger.info(`✅ Successfully registered ${data.length} application commands.`);
    } catch (error) {
        logger.error('❌ Error registering commands:', error);
        throw error;
    }
}

/**
 * Loads all event handlers
 * @param {Client} client The Discord client
 */
async function loadEvents(client) {
    try {
        const eventsPath = path.join(__dirname, 'src', 'events');
        logger.info(`Loading events from: ${eventsPath}`);
        
        // Check if events directory exists
        try {
            await fs.access(eventsPath);
        } catch (error) {
            logger.warn(`Events directory not found: ${eventsPath}`);
            return;
        }

        const eventFiles = (await fs.readdir(eventsPath))
            .filter(file => file.endsWith('.js'));
            
        logger.info(`Found ${eventFiles.length} event files`);

        for (const file of eventFiles) {
            try {
                const filePath = path.join(eventsPath, file);
                logger.info(`Loading event from: ${filePath}`);
                
                // Clear the require cache to allow hot-reloading
                delete require.cache[require.resolve(filePath)];
                
                // Require the event file
                const event = require(filePath);
                
                if (!event || !event.name || !event.execute) {
                    logger.warn(`Event file ${file} is missing required properties (name, execute)`);
                    continue;
                }
                
                // Register the event
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args));
                } else {
                    client.on(event.name, (...args) => event.execute(...args));
                }
                
                logger.info(`✅ Loaded event: ${event.name} (${file})`);
            } catch (error) {
                logger.error(`❌ Error loading event from ${file}:`, error);
                // Continue with other files even if one fails
            }
        }
    } catch (error) {
        logger.error('❌ Error loading events:', error);
        throw error;
    }
}

/**
 * Initializes the voice channel configuration
 */
async function initializeVCConfig() {
    try {
        logger.info('Initializing voice channel configuration...');
        const configPath = path.join(process.cwd(), 'config');
        logger.info(`Using config path: ${configPath}`);
        
        // Create the VC config instance
        const vcConfig = new VCConfig(configPath);
        
        // Store the config in app state
        appState.vcConfig = vcConfig;
        
        // Test the config by trying to get the default guild config
        if (process.env.GUILD_ID) {
            try {
                const guildConfig = await vcConfig.getVCConfig(process.env.GUILD_ID);
                logger.info(`✅ VC configuration loaded for guild ${process.env.GUILD_ID}`);
                logger.debug('VC Config:', guildConfig);
            } catch (guildError) {
                logger.warn(`⚠️  Could not load VC config for guild ${process.env.GUILD_ID}:`, guildError.message);
                logger.info('A new config file will be created when needed');
            }
        } else {
            logger.warn('⚠️  No GUILD_ID set in environment, VC features may be limited');
        }
        
        logger.info('✅ Voice channel configuration initialized');
        return vcConfig;
    } catch (error) {
        logger.error('❌ Failed to initialize voice channel configuration:', error);
        // Don't throw the error to allow the bot to continue running without VC features
        logger.warn('⚠️  Continuing without VC configuration...');
        return null;
    }
}

/**
 * Creates and configures the Discord client
 * @returns {Client} Configured Discord client
 */
function createClient() {
    logger.info('🤖 Creating Discord client...');
    
    if (!process.env.DISCORD_TOKEN) {
        throw new Error('No Discord token found. Please set the DISCORD_TOKEN environment variable.');
    }
    
    // Create the client
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildMessageTyping
        ],
        shards: 'auto',
        rest: {
            retries: 3,
            timeout: 30000
        }
    });

    // Attach config to the client
    client.config = config;
    
    return client;
}

/**
 * Sets up process event handlers
 */
function setupProcessHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('⚠️  Uncaught Exception:', error);
        // Don't exit for uncaught exceptions to keep the process running
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('⚠️  Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        if (appState.shuttingDown) return;
        appState.shuttingDown = true;
        
        logger.info('🛑 Shutting down bot...');
        
        try {
            if (appState.client) {
                await appState.client.destroy();
                logger.info('✅ Client destroyed');
            }
            
            logger.info('👋 Goodbye!');
            process.exit(0);
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    });
}

/**
 * Main initialization function
 */
async function main() {
    console.log('🚀 Starting bot initialization...');
    console.log('   Node.js Version:', process.version);
    console.log('   Current Directory:', process.cwd());
    console.log('   Environment Variables:', {
        NODE_ENV: process.env.NODE_ENV || 'development',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN ? '*** (exists)' : 'undefined',
        CLIENT_ID: process.env.CLIENT_ID || 'undefined',
        GUILD_ID: process.env.GUILD_ID || 'undefined'
    });
    
    try {
        // Load configuration
        console.log('\n🔧 STEP 1: Loading configuration...');
        try {
            await config.load();
            console.log('✅ Configuration loaded successfully');
        } catch (err) {
            console.error('❌ Failed to load configuration:', err);
            throw err;
        }
        
        // Create and configure client
        console.log('\n🤖 STEP 2: Creating Discord client...');
        let client;
        try {
            // Create client with config
            client = createClient();
            
            // Set the client on the command handler
            commandHandler.setClient(client);
            // Attach config to client
            client.config = config;
            appState.client = client;
            console.log('✅ Discord client created with config attached');
        } catch (err) {
            console.error('❌ Failed to create Discord client:', err);
            throw err;
        }
        
        // Setup process handlers
        console.log('\n⚙️  STEP 3: Setting up process handlers...');
        try {
            setupProcessHandlers();
            console.log('✅ Process handlers set up');
        } catch (err) {
            console.error('❌ Failed to set up process handlers:', err);
            throw err;
        }
        
                        // Load commands using the command handler
        console.log('\n📦 STEP 4: Loading commands...');
        try {
            await commandHandler.loadCommands();
            console.log(`✅ ${commandHandler.commands.size} commands loaded`);
            
            // Log loaded commands for debugging
            console.log('\n📋 Loaded commands:');
            commandHandler.commands.forEach((cmd, name) => {
                console.log(`   - ${name} (${cmd.data?.description || 'No description'})`);
            });
            
        } catch (err) {
            console.error('❌ Failed to load commands:', err);
            throw err;
        }
        
        // Note: Command registration is now handled by deploy-commands.js
        console.log('\nℹ️  Use `npm run deploy` to register/update slash commands with Discord');
        
        // Load event handlers
        console.log('\n🎭 STEP 6: Loading event handlers...');
        try {
            await loadEvents(client);
            console.log('✅ Event handlers loaded');
        } catch (err) {
            console.error('❌ Failed to load event handlers:', err);
            throw err;
        }
        
        // Initialize VC configuration
        console.log('\n🔊 STEP 7: Initializing voice channel configuration...');
        try {
            await initializeVCConfig();
            console.log('✅ Voice channel configuration initialized');
        } catch (err) {
            console.error('❌ Failed to initialize VC config:', err);
            console.warn('⚠️  Continuing without VC configuration...');
        }
        
        // Login to Discord
        console.log('\n🔑 STEP 8: Logging in to Discord...');
        try {
            await client.login(process.env.DISCORD_TOKEN);
            console.log(`✅ Logged in as ${client.user.tag}`);
            console.log(`   Serving ${client.guilds.cache.size} guild(s)`);
            
            // Log startup info
            console.log('\n🚀 Bot is now running!');
            console.log('   Node.js Version:', process.version);
            console.log('   Memory Usage:', `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
            
        } catch (loginError) {
            console.error('❌ Failed to log in to Discord:', loginError);
            throw loginError;
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error during initialization:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Start the application
main().catch(error => {
    logger.error('❌ Unhandled error in main:', error);
    process.exit(1);
});
