const fs = require('fs').promises;
const path = require('path');

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
            retryDelay: 2000
        },
        permissions: {
            ownerID: 'YOUR_USER_ID_HERE'
        },
        roles: {
            voiceChannel: {
                name: 'in vc',
                color: '#00ff00',
                mentionable: true
            }
        },
        logging: {
            level: 'info',
            file: {
                maxSize: '5MB',
                maxFiles: 5
            }
        },
        database: {
            enabled: false,
            type: 'sqlite',
            path: './data/bot.db'
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

async function createConfigFile(configDir, filename, content) {
    const filePath = path.join(configDir, filename);
    
    try {
        // Check if file already exists
        try {
            await fs.access(filePath);
            console.log(`⚠️  ${filename} already exists, skipping...`);
            return false;
        } catch {
            // File doesn't exist, create it
            await fs.writeFile(
                filePath,
                JSON.stringify(content, null, 4),
                'utf8'
            );
            console.log(`✅ Created ${filename}`);
            return true;
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

async function main() {
    console.log('🚀 Setting up bot configuration...\n');
    
    const configDir = await ensureConfigDir();
    
    // Create config files
    for (const [filename, content] of Object.entries(defaultConfigs)) {
        await createConfigFile(configDir, filename, content);
    }
    
    // Create .env file
    await createEnvFile();
    
    console.log('\n✨ Setup complete!');
    console.log('📝 Next steps:');
    console.log('1. Edit the .env file with your Discord bot token');
    console.log('2. Review the configuration files in the config/ directory');
    console.log('3. Run `npm start` to start the bot\n');
}

main().catch(console.error);
