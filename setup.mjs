import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create config directory if it doesn't exist
async function ensureConfigDir() {
    const configDir = path.join(__dirname, 'config');
    try {
        await fs.mkdir(configDir, { recursive: true });
        console.log('✅ Config directory ready');
        return configDir;
    } catch (error) {
        console.error('❌ Failed to create config directory:', error);
        process.exit(1);
    }
}

// Default configurations
const defaultConfigs = {
    'bot-config.json': {
        bot: {
            prefix: '!',
            version: '1.0.0',
            maxRetries: 3,
            retryDelay: 2000,
            presenceUpdateInterval: 120000
        },
        permissions: {
            ownerID: 'YOUR_USER_ID_HERE',
            adminRoles: [],
            moderatorRoles: []
        },
        roles: {
            voiceChannel: {
                name: 'in vc',
                color: '#00ff00',
                mentionable: true,
                enabled: true,
                autoRemove: true
            }
        },
        events: {
            voiceStateUpdate: {
                enabled: true,
                debug: false,
                autoManageRoles: true
            },
            messageCreate: {
                enabled: true,
                commandPrefix: '!',
                ignoreBots: true
            },
            guildMemberAdd: {
                enabled: true,
                welcomeMessage: 'Welcome {member} to {server}!',
                assignDefaultRole: false,
                defaultRoleId: ''
            }
        },
        logging: {
            level: 'info',
            file: {
                enabled: true,
                maxSize: '5MB',
                maxFiles: 5,
                directory: './logs'
            },
            console: {
                enabled: true,
                timestamp: true
            }
        },
        database: {
            enabled: false,
            type: 'sqlite',
            path: './data/bot.db',
            backup: {
                enabled: true,
                interval: '1d',
                keepLast: 7
            }
        }
    },
    'presence-config.json': {
        status: 'online',
        activities: [
            {
                name: 'on {guilds} servers',
                type: 'WATCHING'
            },
            {
                name: 'with {users} users',
                type: 'PLAYING'
            },
            {
                name: 'v{version}',
                type: 'PLAYING'
            },
            {
                name: '{prefix}help',
                type: 'LISTENING'
            }
        ],
        statusMessages: [
            'Serving {guilds} servers with {users} users',
            'Version {version} | Prefix: {prefix}',
            'Type {prefix}help for commands'
        ],
        updateInterval: 120000,
        randomizeStatus: true,
        activitySettings: {
            showTimestamps: true,
            showServerCount: true,
            showUserCount: true
        }
    }
};

// Deep merge objects
function deepMerge(target, source) {
    const output = { ...target };
    
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    
    return output;
}

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

async function createConfigFile(configDir, filename, content) {
    const filePath = path.join(configDir, filename);
    
    try {
        // Check if file already exists
        try {
            await fs.access(filePath);
            const currentContent = await fs.readFile(filePath, 'utf8');
            const currentConfig = JSON.parse(currentContent);
            
            // Deep merge with existing config to preserve user settings
            const mergedConfig = deepMerge(currentConfig, content);
            
            // Only write if there are changes
            if (JSON.stringify(mergedConfig) !== currentContent) {
                await fs.writeFile(
                    filePath,
                    JSON.stringify(mergedConfig, null, 4) + '\n',
                    'utf8'
                );
                console.log(`🔄 Updated ${filename} with new settings`);
            } else {
                console.log(`ℹ️  ${filename} is up to date`);
            }
            return true;
        } catch (error) {
            if (error.code === 'ENOENT' || error instanceof SyntaxError) {
                // File doesn't exist or is invalid JSON, create/overwrite it
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(
                    filePath,
                    JSON.stringify(content, null, 4) + '\n',
                    'utf8'
                );
                console.log(`✅ Created ${filename}`);
                return true;
            }
            throw error;
        }
    } catch (error) {
        console.error(`❌ Failed to create ${filename}:`, error);
        return false;
    }
}

async function createEnvFile() {
    const envPath = path.join(__dirname, '.env');
    const envContent = `# Discord Bot Token
DISCORD_TOKEN=your_bot_token_here

# Optional: Database configuration
# DATABASE_URL=sqlite:./data/bot.db
# or for PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Optional: Logging level (error, warn, info, debug)
LOG_LEVEL=info
`;

    try {
        await fs.access(envPath);
        console.log('⚠️  .env file already exists, skipping...');
        return false;
    } catch {
        await fs.writeFile(envPath, envContent, 'utf8');
        console.log('✅ Created .env file');
        console.log('ℹ️  Please edit the .env file with your bot token and other settings');
        return true;
    }
}

async function validateConfig(config) {
    const requiredFields = {
        'bot.prefix': 'string',
        'permissions.ownerID': 'string',
        'roles.voiceChannel.name': 'string'
    };

    const errors = [];
    
    for (const [path, type] of Object.entries(requiredFields)) {
        const value = path.split('.').reduce((obj, key) => obj && obj[key], config);
        
        if (value === undefined || value === null) {
            errors.push(`Missing required field: ${path}`);
        } else if (typeof value !== type) {
            errors.push(`Invalid type for ${path}: expected ${type}, got ${typeof value}`);
        }
    }
    
    return errors;
}

async function main() {
    console.log('🚀 Setting up bot configuration...\n');
    
    const configDir = await ensureConfigDir();
    
    // Create config files
    for (const [filename, content] of Object.entries(defaultConfigs)) {
        await createConfigFile(configDir, filename, content);
    }
    
    // Create .env file
    await createEnvFile();
    
    // Validate the created/updated config
    const configPath = path.join(configDir, 'bot-config.json');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    const errors = await validateConfig(config);
    if (errors.length > 0) {
        console.warn('\n⚠️  Configuration validation warnings:');
        errors.forEach(error => console.warn(`  - ${error}`));
    }
    
    console.log('\n✨ Setup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Edit the .env file with your Discord bot token');
    console.log('2. Update the ownerID in config/bot-config.json with your Discord user ID');
    console.log('3. Review the configuration files in the config/ directory');
    console.log('4. Run `npm start` to start the bot\n');
    
    if (errors.length > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
