/**
 * Module for managing voice channel roles in Discord.
 * @module eventloader
 */

import { GatewayIntentBits, Client } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';

// Cache for loaded events to prevent duplicate loading
const loadedEvents = new Map();

/**
 * Role name to manage for voice channel events
 * @constant {string}
 */
const ROLE_NAME = 'in vc';

// Debug logging helper
const debug = (...args) => {

};

/**
 * Sets up the voice state update event handler
 * @param {Client} client - Discord.js client instance
 * @throws {Error} If client is invalid
 */
function setupVoiceStateUpdate(client) {
    debug('Setting up voice state update handler');
    
    if (!client || !client.on) {
        const error = new Error('Invalid client instance');
        console.error('❌ Error in setupVoiceStateUpdate:', error);
        throw error;
    }

    return client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            debug('Voice state update detected');
            
            // Validate state objects
            if (!newState || !oldState) {
                console.warn('❌ Invalid state objects in voiceStateUpdate');
                return;
            }
            
            // Check if member exists
            if (!newState.member) {
                console.warn('❌ No member found in voiceStateUpdate');
                return;
            }
            
            // Check if guild is available
            if (!newState.guild?.available) {
                console.warn('Guild not available in voiceStateUpdate');
                return;
            }
            
            // Check if roles cache is available
            if (!newState.guild.roles?.cache) {
                console.warn('No guild roles cache found in voiceStateUpdate');
                return;
            }

            // Find the role (case insensitive)
            const role = newState.guild.roles.cache.find(r => 
                r.name.toLowerCase() === ROLE_NAME.toLowerCase()
            );

            if (!role) {
                console.warn(`❌ Role "${ROLE_NAME}" not found in guild roles`);
                return;
            }

            // Only process if user is in a voice channel
            if (!newState.channelId && !oldState.channelId) {
                debug('No channel change detected');
                return;
            }

            const action = newState.channel ? 'add' : 'remove';
            debug(`Performing role ${action} for user ${newState.member.user.tag}`);
            
            await newState.member.roles[action](role);

        } catch (error) {
            console.error('❌ Error in voiceStateUpdate:', {
                error: error.message,
                stack: error.stack,
                user: newState?.member?.user?.tag || 'unknown',
                guild: newState?.guild?.name || 'unknown'
            });
        }
    });
}

/**
 * Loads and registers all event handlers
 * @param {Client} client - Discord client instance
 * @throws {Error} If client is invalid
 */
export default async (client) => {

    
    if (!client || !client.on) {
        const error = new Error('Invalid client instance provided to event loader');
        console.error('❌ Error in event loader:', error);
        throw error;
    }

    try {
        // Setup debug event listeners

        client.on('warn', info => console.warn(`[DISCORD_WARN] ${info}`));
        client.on('error', error => console.error(`[DISCORD_ERROR]`, error));

        // Load voice state update handler

        setupVoiceStateUpdate(client);


        // Load other event handlers
        const eventsDir = path.join(__dirname, 'events');

        
        try {
            // Check if events directory exists
            await fs.access(eventsDir);
            
            const eventFiles = (await fs.readdir(eventsDir))
                .filter(file => file.endsWith('.js') && !file.startsWith('_'));
            

            
            for (const file of eventFiles) {
                const eventName = path.parse(file).name;
                const filePath = path.join(eventsDir, file);
                

                
                try {
                    // Clear require cache to ensure fresh module load
                    delete require.cache[require.resolve(filePath)];
                    const event = require(filePath);
                    
                    if (typeof event !== 'function') {
                        console.warn(`⚠️ Event ${eventName} does not export a function`);
                        continue;
                    }
                    
                    // Skip if event is already loaded
                    if (loadedEvents.has(eventName)) {

                        continue;
                    }
                    
                    // Remove existing listener if it exists
                    const listenerCount = client.listeners(eventName).length;
                    if (listenerCount > 0) {

                        client.removeAllListeners(eventName);
                    }
                    
                    if (eventName === 'ready') {
                        // For ready event, use client.once to ensure it only runs once
                        client.once('ready', async () => {

                            try {
                                await event(client);

                            } catch (error) {
                                console.error(`❌ Error in ready event handler:`, error);
                            }
                        });
                    } else {
                        // For other events, pass client as the first parameter
                        client.on(eventName, async (...args) => {
                            try {
                                await event(client, ...args);
                            } catch (error) {
                                console.error(`❌ Error in ${eventName} event:`, error);
                            }
                        });
                    }
                    
                    loadedEvents.set(eventName, filePath);

                    
                } catch (error) {
                    console.error(`❌ Failed to load event ${file}:`, error);
                }
            }
            

            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`❌ Events directory not found: ${eventsDir}`);
            } else {
                console.error('❌ Error reading events directory:', error);
            }
            throw error;
        }
        
    } catch (error) {
        console.error('❌ Error in event loader:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};
