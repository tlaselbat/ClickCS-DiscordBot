const { Collection } = require('discord.js');
const path = require('path');
const { readdir, stat } = require('fs').promises;
const { createCommandHandler } = require('../utils/interactionUtils');
const { handleError } = require('../utils/errorUtils');
const { isDev, env } = require('../utils/env');
const logger = require('../utils/logger');

// Command rate limiting (10 commands per 30 seconds per user)
const userCooldowns = new Collection();
const COOLDOWN_AMOUNT = 30 * 1000; // 30 seconds
const MAX_COMMANDS = 10; // Increased from 5 to 10 commands

class CommandHandlerV2 {
  constructor() {
    this.commands = new Collection();
    this.aliases = new Map();
    this.cooldowns = new Collection();
    this.slashCommands = [];
    this.contextMenus = [];
  }

  /**
   * Register a command with the handler
   * @param {Object} command - The command to register
   * @returns {void}
   */
  registerCommand(command) {
    const commandName = command.data.name;
    
    if (this.commands.has(commandName)) {
      throw new Error(`A command with the name "${commandName}" is already registered.`);
    }

    // Add to appropriate collections
    this.commands.set(commandName, command);
    
    // Add slash command data for registration
    if (command.data) {
      if (command.data.type === 'MESSAGE' || command.data.type === 'USER') {
        this.contextMenus.push(command.data);
      } else {
        this.slashCommands.push(command.data);
      }
    }
    
    // Register aliases if they exist
    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        if (this.aliases.has(alias)) {
          logger.warn(`Skipping duplicate alias: ${alias}`);
          continue;
        }
        this.aliases.set(alias, commandName);
        logger.debug(`Registered alias: ${alias} -> ${commandName}`);
      }
    }
    
    logger.info(`Registered command: ${commandName}`);
  }

  /**
   * Recursively load commands from a directory
   * @param {string} directory - Directory to load commands from
   * @returns {Promise<void>}
   */
  async loadCommands(directory = path.join(process.cwd(), 'src/commands')) {
    try {
      logger.info(`Loading commands from: ${directory}`);
      
      // Read the directory
      const entries = await readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively load commands from subdirectories
          await this.loadCommands(fullPath);
          continue;
        }
        
        // Only process .js files
        if (!entry.name.endsWith('.js')) continue;
        
        try {
          logger.debug(`Loading command file: ${fullPath}`);
          
          // Import the command module using require
          delete require.cache[require.resolve(fullPath)];
          let commandModule;
          try {
            commandModule = require(fullPath);
            
            // For CommonJS, we don't need to handle default exports
            const command = commandModule;
            
            // Skip if not a valid command
            if (!command || !command.data || !command.execute) {
              logger.warn(`Skipping invalid command in ${entry.name}: missing data or execute method`);
              logger.debug('Command module content:', JSON.stringify({
                hasData: !!command?.data,
                hasExecute: !!command?.execute,
                keys: command ? Object.keys(command) : []
              }, null, 2));
              continue;
            }
            
            // Register the command
            logger.debug(`Registering command: ${command.data.name} from ${entry.name}`);
            this.registerCommand(command);
            logger.debug(`Command ${command.data.name} registered successfully`);
            
          } catch (error) {
            logger.error(`Error requiring command file ${entry.name}:`, error);
            continue;
          }
          
        } catch (error) {
          logger.error(`Error loading command ${entry.name}`, error);
          if (isDev()) {
            console.error(`Error loading command ${entry.name}:`, error);
          }
        }
      }
      
      logger.info(`Successfully loaded ${this.commands.size} commands`);
      logger.info(`Found ${this.slashCommands.length} slash commands`);
      logger.info(`Found ${this.contextMenus.length} context menus`);
      
    } catch (error) {
      logger.error('Failed to load commands', error);
      throw error;
    }
  }

  /**
   * Get a command by name or alias
   * @param {string} name - Command name or alias
   * @returns {Object|null} The command or null if not found
   */
  getCommand(name) {
    // Check if it's an alias
    if (this.aliases.has(name)) {
      name = this.aliases.get(name);
    }
    return this.commands.get(name) || null;
  }

  /**
   * Check if a user is rate limited
   * @param {string} userId - User ID to check
   * @returns {Object} Object with limited status and remaining time
   */
  isRateLimited(userId) {
    // Get or initialize user's command timestamps
    if (!userCooldowns.has(userId)) {
      userCooldowns.set(userId, []);
    }
    
    const timestamps = userCooldowns.get(userId);
    const now = Date.now();
    
    // Remove old timestamps (older than COOLDOWN_AMOUNT)
    const recentCommands = timestamps.filter(timestamp => now - timestamp < COOLDOWN_AMOUNT);
    userCooldowns.set(userId, recentCommands);
    
    // Check if user has exceeded the rate limit
    if (recentCommands.length >= MAX_COMMANDS) {
      const oldest = recentCommands[0];
      const cooldownEnd = oldest + COOLDOWN_AMOUNT;
      const remaining = Math.ceil((cooldownEnd - now) / 1000);
      
      return {
        limited: true,
        remaining,
        reset: cooldownEnd
      };
    }
    
    // Add current timestamp
    recentCommands.push(now);
    return { limited: false };
  }

  /**
   * Handle an incoming interaction
   * @param {import('discord.js').Interaction} interaction - The interaction to handle
   * @returns {Promise<boolean>} True if the interaction was handled as a command
   */
  async handleInteraction(interaction) {
    // Only handle command interactions
    if (!interaction.isCommand() && !interaction.isContextMenuCommand()) {
      return false;
    }

    const command = this.getCommand(interaction.commandName);
    
    // Command not found
    if (!command) {
      logger.warn(`Command not found: ${interaction.commandName}`);
      return false;
    }

    // Skip cooldown for bot owners and admins
    const isOwner = interaction.guild?.ownerId === interaction.user.id;
    const isAdmin = interaction.memberPermissions?.has('ADMINISTRATOR');
    
    // Only apply cooldown to regular users
    if (!isOwner && !isAdmin) {
      const cooldown = this.isRateLimited(interaction.user.id);
      if (cooldown.limited) {
        const timeWord = cooldown.remaining === 1 ? 'second' : 'seconds';
        await interaction.reply({
          content: `⏳ You're using commands too quickly! Please wait ${cooldown.remaining} ${timeWord} before using another command.`,
          ephemeral: true
        });
        return true;
      }
    }

    // Execute the command with error handling
    try {
      logger.info(`Executing command: ${command.data.name} by ${interaction.user.tag}`);
      
      // Defer reply for commands that might take a while
      if (command.defer) {
        await interaction.deferReply({ ephemeral: command.ephemeral });
      }
      
      // Execute the command
      await command.execute(interaction);
      
      return true;
      
    } catch (error) {
      // Use our error handler
      await handleError(error, { 
        interaction,
        logError: true,
        ephemeral: true
      });
      return true;
    }
  }

  /**
   * Register all slash commands with Discord
   * @param {import('discord.js').Client} client - The Discord client
   * @returns {Promise<void>}
   */
  async registerApplicationCommands(client) {
    try {
      if (!client.application) {
        throw new Error('Client application is not ready');
      }

      logger.info('Registering application commands...');
      
      // Get the test guild ID from environment variables
      const testGuildId = process.env.TEST_GUILD_ID;
      
      // Debug log the commands being registered
      logger.debug(`Found ${this.slashCommands.length} slash commands and ${this.contextMenus.length} context menus to register`);
      
      if (testGuildId) {
        // Register commands in test guild (for development)
        logger.info(`Registering commands for test guild: ${testGuildId}`);
        const guild = await client.guilds.fetch(testGuildId);
        const commands = [...this.slashCommands, ...this.contextMenus];
        
        logger.debug(`Commands to register: ${commands.map(cmd => cmd.name).join(', ')}`);
        
        try {
          const data = await guild.commands.set(commands);
          logger.info(`✅ Successfully registered ${data.size} application commands to test guild ${guild.name}`);
          
          // Debug log the registered commands
          const registeredCommands = await guild.commands.fetch();
          logger.debug(`Registered commands: ${registeredCommands.map(cmd => `/${cmd.name} (${cmd.id})`).join(', ')}`);
          
        } catch (guildError) {
          logger.error(`Failed to register commands to guild ${guild.name}:`, guildError);
          throw guildError;
        }
      } else {
        // In production or development without test guild, register globally
        logger.info('Registering global application commands...');
        const commands = [...this.slashCommands, ...this.contextMenus];
        
        try {
          const data = await client.application.commands.set(commands);
          logger.info(`✅ Successfully registered ${data.size} global application commands`);
          
          // Debug log the registered commands
          const registeredCommands = await client.application.commands.fetch();
          logger.debug(`Registered global commands: ${registeredCommands.map(cmd => `/${cmd.name} (${cmd.id})`).join(', ')}`);
          
        } catch (globalError) {
          logger.error('Failed to register global commands:', globalError);
          throw globalError;
        }
      }
      
    } catch (error) {
      logger.error('❌ Failed to register application commands:', error);
      // Don't throw the error here to prevent the bot from crashing
      // This allows the bot to continue running even if command registration fails
    }
  }
  
  /**
   * Handle an interaction (slash command or context menu)
   * @param {import('discord.js').Interaction} interaction - The interaction to handle
   * @returns {Promise<void>}
   */
  async handleInteraction(interaction) {
    if (!interaction.isCommand() && !interaction.isContextMenuCommand()) return;

    const { commandName } = interaction;
    const command = this.commands.get(commandName) || this.commands.get(this.aliases.get(commandName));

    if (!command) {
      logger.warn(`No command matching ${commandName} was found.`);
      return interaction.reply({
        content: '❌ This command is not available.',
        ephemeral: true,
      });
    }

    // Check cooldown
    const { cooldowns } = this;
    if (!cooldowns.has(command.data.name)) {
      cooldowns.set(command.data.name, new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return interaction.reply({
          content: `Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.data.name}\` command.`,
          ephemeral: true,
        });
      }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    // Execute the command
    try {
      logger.info(`Executing command ${command.data.name} for ${interaction.user.tag}`);
      // Pass both interaction and client to the execute function
      await command.execute(interaction, interaction.client);
    } catch (error) {
      logger.error(`Error executing command ${command.data.name}:`, error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ There was an error executing this command!',
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
          content: '❌ There was an error executing this command!',
          ephemeral: true,
        });
      }
    }
  }
}

// Create and initialize the singleton instance
const commandHandler = new CommandHandlerV2();

// Export the singleton instance
module.exports = commandHandler;

// For backward compatibility with existing code
module.exports.CommandHandlerV2 = CommandHandlerV2;
module.exports.commandHandler = commandHandler;
