/**
 * Main entry point for the Discord Voice Chat Bot
 * This file initializes the Discord client and sets up the bot's core functionality
 */

// Import required Discord.js library
const Discord = require("discord.js");

/**
 * Create a new Discord client instance with specific intents
 * @type {Discord.Client}
 */
const client = new Discord.Client({
    intents: [
        // Required intents for bot functionality
        Discord.GatewayIntentBits.Guilds,              // Access to guild information
        Discord.GatewayIntentBits.GuildVoiceStates,    // Access to voice state changes
        Discord.GatewayIntentBits.GuildMessages,       // Access to guild messages
        Discord.GatewayIntentBits.DirectMessages       // Access to direct messages
    ]
});

// Load authentication settings from config file
const settings = require('./auth.json');

// Load event handlers for the bot
require(`./eventloader.js`)(client);

// Login to Discord using the provided token
client.login(settings.token);