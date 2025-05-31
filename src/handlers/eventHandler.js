const { readdir } = require('fs').promises;
const path = require('path');
const { handleError } = require('../utils/errorUtils');
const logger = require('../utils/logger');

class EventHandler {
  constructor(client) {
    this.client = client;
    this.events = new Map();
  }

  /**
   * Load all event handlers from the events directory
   * @param {string} [directory] - Directory to load events from
   * @returns {Promise<void>}
   */
  async loadEvents(directory = path.join(process.cwd(), 'src/events')) {
    try {
      logger.info(`Loading events from: ${directory}`);
      
      // Read the events directory
      const files = (await readdir(directory)).filter(file => file.endsWith('.js'));
      
      // Load each event file
      for (const file of files) {
        try {
          const filePath = path.join(directory, file);
          const modulePath = `file://${filePath}`.replace(/\\/g, '/');
          const { default: event } = await import(modulePath);
          
          // Validate the event
          if (!event || !event.name || typeof event.execute !== 'function') {
            logger.warn(`Skipping invalid event in ${file}: missing name or execute method`);
            continue;
          }
          
          // Register the event
          this.registerEvent(event);
          
        } catch (error) {
          logger.error(`Error loading event ${file}`, error);
        }
      }
      
      logger.info(`Successfully loaded ${this.events.size} events`);
      
    } catch (error) {
      logger.error('Failed to load events', error);
      throw error;
    }
  }
  
  /**
   * Register a single event
   * @param {Object} event - The event to register
   * @param {string} event.name - The name of the event
   * @param {Function} event.execute - The function to execute when the event is emitted
   * @param {boolean} [event.once=false] - Whether the event should only be listened to once
   * @returns {void}
   */
  registerEvent(event) {
    const execute = async (...args) => {
      try {
        await event.execute(this.client, ...args);
      } catch (error) {
        logger.error(`Error in event ${event.name}`, error);
        
        // Handle specific events that might need special error handling
        if (event.name === 'error') {
          // For error events, we might want to do something special
          console.error('Unhandled error event:', error);
        }
      }
    };
    
    // Store the event for potential removal later
    this.events.set(event.name, {
      ...event,
      execute,
      listener: event.once 
        ? (...args) => this.client.once(event.name, execute, ...args)
        : (...args) => this.client.on(event.name, execute, ...args)
    });
    
    // Register the event with Discord.js
    if (event.once) {
      this.client.once(event.name, execute);
    } else {
      this.client.on(event.name, execute);
    }
    
    logger.debug(`Registered event: ${event.name} (${event.once ? 'once' : 'on'})`);
  }
  
  /**
   * Unregister an event
   * @param {string} eventName - The name of the event to unregister
   * @returns {boolean} Whether the event was unregistered
   */
  unregisterEvent(eventName) {
    const event = this.events.get(eventName);
    if (!event) return false;
    
    this.client.off(eventName, event.execute);
    this.events.delete(eventName);
    
    logger.debug(`Unregistered event: ${eventName}`);
    return true;
  }
  
  /**
   * Unregister all events
   * @returns {void}
   */
  unregisterAllEvents() {
    for (const [eventName] of this.events) {
      this.unregisterEvent(eventName);
    }
  }
  
  /**
   * Reload all events
   * @returns {Promise<void>}
   */
  async reloadEvents() {
    this.unregisterAllEvents();
    await this.loadEvents();
  }
}

/**
 * Create and initialize the event handler
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<EventHandler>} The initialized event handler
 */
async function createEventHandler(client) {
  const eventHandler = new EventHandler(client);
  await eventHandler.loadEvents();
  return eventHandler;
}

module.exports = {
  EventHandler,
  createEventHandler,
  default: createEventHandler
};
