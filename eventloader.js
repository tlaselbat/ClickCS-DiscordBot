/**
 * Event loader module for Discord.js bot
 * @module eventloader
 */

import { Client } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration
const DEFAULT_CONFIG = {
    roles: {
        voiceChannel: {
            name: 'in vc',
            enabled: true,
            autoRemove: true
        }
    },
    events: {
        voiceStateUpdate: {
            enabled: true,
            debug: false,
            autoManageRoles: true
        }
    }
};

// Events directory
const EVENTS_DIR = path.join(__dirname, 'events');

/**
 * Logger with consistent formatting
 */
class Logger {
    static log(message, type = 'INFO') {
        const prefix = `[${type}] ${new Date().toISOString()}`;
        console.log(`${prefix} ${message}`);
    }

    static error(error, context = {}) {
        this.log(`Error: ${error.message}`, 'ERROR');
        console.error({
            error: error.message,
            stack: error.stack,
            ...context
        });
    }

    static warn(message) {
        this.log(message, 'WARN');
    }
}

/**
 * Event Manager class for handling Discord events
 */
class EventManager {
    constructor(client, config = {}) {
        this.client = client;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.loadedEvents = new Map();
        this.initialize();
    }

    initialize() {
        this.setupDebugListeners();
        this.setupVoiceStateUpdate();
        this.loadEvents();
    }

    setupDebugListeners() {
        this.client.on('warn', info => Logger.log(`Discord Warn: ${info}`, 'WARN'));
        this.client.on('error', error => Logger.error(error));
    }

    setupVoiceStateUpdate() {
        // Voice state updates are now handled by events/voiceStateUpdate.js
        // This prevents duplicate event handling and potential conflicts
        Logger.log('Voice state update handling is managed by events/voiceStateUpdate.js');
    }

    async loadEvents() {
        try {
            await fs.access(EVENTS_DIR);
            const eventFiles = await fs.readdir(EVENTS_DIR);
            
            const validEvents = eventFiles
                .filter(file => file.endsWith('.js') && !file.startsWith('_'));

            for (const file of validEvents) {
                await this.loadEvent(file);
            }

        } catch (error) {
            if (error.code === 'ENOENT') {
                Logger.error(error, { context: 'Events directory not found' });
            } else {
                Logger.error(error, { context: 'Error reading events directory' });
            }
        }
    }

    async loadEvent(file) {
        const eventName = path.parse(file).name;
        const filePath = path.join(EVENTS_DIR, file);

        try {
            delete require.cache[require.resolve(filePath)];
            const event = require(filePath);

            if (typeof event !== 'function') {
                Logger.warn(`Event ${eventName} does not export a function`);
                return;
            }

            if (this.loadedEvents.has(eventName)) {
                Logger.warn(`Event ${eventName} is already loaded`);
                return;
            }

            const listenerCount = this.client.listeners(eventName).length;
            if (listenerCount > 0) {
                Logger.log(`Removing ${listenerCount} existing listeners for ${eventName}`, 'WARN');
                this.client.removeAllListeners(eventName);
            }

            const handler = async (...args) => {
                try {
                    await event(this.client, ...args);
                } catch (error) {
                    Logger.error(error, { context: `Event handler for ${eventName}` });
                }
            };

            if (eventName === 'ready') {
                this.client.once('ready', handler);
            } else {
                this.client.on(eventName, handler);
            }

            this.loadedEvents.set(eventName, filePath);
            Logger.log(`Successfully loaded event: ${eventName}`);

        } catch (error) {
            Logger.error(error, { context: `Loading event ${file}` });
        }
    }
}

/**
 * Main export function
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<void>}
 */
export default async (client, config = {}) => {
    if (!client || !client.on) {
        const error = new Error('Invalid client instance provided to event loader');
        Logger.error(error);
        throw error;
    }

    try {
        const eventManager = new EventManager(client, config);
        return eventManager;
    } catch (error) {
        Logger.error(error);
        throw error;
    }
};
