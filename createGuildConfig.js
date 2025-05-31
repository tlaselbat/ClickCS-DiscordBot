import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get guild ID from environment variable
const guildId = process.env.GUILD_ID;

// Create config object
const config = {
  server: {
    id: guildId,
    name: "Default Guild",
    prefix: "!"
  },
  modules: {
    moderation: true,
    music: true,
    utility: true
  },
  channels: {
    log: "",
    welcome: "",
    rules: ""
  },
  roles: {
    admin: "",
    mod: "",
    muted: ""
  },
  messages: {
    welcome: "Welcome to our server, {user}!",
    goodbye: "Goodbye, {user}!"
  }
};

// Ensure guilds directory exists
const guildsDir = join(process.cwd(), 'config', 'guilds');
if (!existsSync(guildsDir)) {
  mkdirSync(guildsDir, { recursive: true });
}

// Write config file
const configPath = join(guildsDir, `${guildId}.json`);
writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log(`Successfully created guild config at: ${configPath}`);
