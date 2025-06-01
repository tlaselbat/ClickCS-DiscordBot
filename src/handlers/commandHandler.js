const { Collection } = require('discord.js');
const path = require('path');
const { readdir } = require('fs').promises;
const logger = require('../utils/logger');
const { isDev } = require('../utils/env');

// Command rate limiting
const userCooldowns = new Collection();
const COOLDOWN_AMOUNT = 30 * 1000; // 30 seconds
const MAX_COMMANDS = 10;

class CommandHandler {
  constructor() {
    // Store the Discord client
    this.client = null;
    
    // Unified command storage
    this.commands = new Collection();
    this.aliases = new Map();
    this.cooldowns = new Collection();
    
    // Application command data for registration
    this.slashCommands = [];
    this.contextMenus = [];
  }
  
  /**
   * Set the Discord client instance
   * @param {import('discord.js').Client} client - The Discord client
   */
  setClient(client) {
    this.client = client;
  }

  /**
   * Register a command with the handler
   * @param {Object} command - The command to register
   * @returns {void}
   */
  registerCommand(command) {
    const commandName = command.data?.name || command.name;
    
    if (!commandName) {
      throw new Error('Command must have a name or data.name');
    }

    if (this.commands.has(commandName)) {
      throw new Error(`A command with the name "${commandName}" is already registered.`);
    }

    // Add to appropriate collections
    this.commands.set(commandName, command);
    
    // Handle application commands
    if (command.data) {
      if (command.data.type === 'MESSAGE' || command.data.type === 'USER') {
        this.contextMenus.push(command.data);
      } else {
        this.slashCommands.push(command.data);
      }
    }
    
    // Register aliases if they exist
    if (command.aliases?.length) {
      for (const alias of command.aliases) {
        if (this.aliases.has(alias)) {
          logger.warn(`Skipping duplicate alias: ${alias}`);
          continue;
        }
        this.aliases.set(alias, commandName);
        logger.debug(`Registered alias: ${alias} -> ${commandName}`);
      }
    }
    
    logger.info(`Registered command: ${commandName} (${command.data ? 'slash' : 'message'} command)`);
  }

  /**
   * Load all commands from a directory
   * @param {string} [directory] - Directory to load commands from
   * @returns {Promise<void>}
   */
  async loadCommands(directory = path.join(process.cwd(), 'src/commands')) {
    try {
      logger.info(`Loading commands from: ${directory}`);
      
      const readCommands = async (dir) => {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await readCommands(fullPath);
            continue;
          }
          
          // Skip non-JS files and test files
          if (!entry.name.endsWith('.js') || entry.name.startsWith('_') || entry.name.endsWith('.test.js')) {
            continue;
          }
          
          try {
            const commandModule = require(fullPath);
            
            // Handle different export formats
            if (commandModule.data) {
              // Slash command
              this.registerCommand(commandModule);
            } else if (commandModule.messageCommand) {
              // Legacy message command
              this.registerCommand({
                ...commandModule.messageCommand,
                isLegacy: true
              });
            } else if (commandModule.name && commandModule.execute) {
              // Direct legacy command
              this.registerCommand({
                ...commandModule,
                isLegacy: true
              });
            } else {
              logger.warn(`Invalid command format in ${entry.name}: missing required properties`);
            }
          } catch (error) {
            logger.error(`Error loading command ${entry.name}:`, error);
            if (isDev()) {
              console.error(error);
            }
          }
        }
      };
      
      await readCommands(directory);
      
      logger.info(`Successfully loaded ${this.commands.size} commands`);
      logger.info(`- Slash commands: ${this.slashCommands.length}`);
      logger.info(`- Context menus: ${this.contextMenus.length}`);
      logger.info(`- Legacy commands: ${[...this.commands.values()].filter(cmd => cmd.isLegacy).length}`);
      
    } catch (error) {
      logger.error('Failed to load commands:', error);
      throw error;
    }
  }

  /**
   * Register application commands with Discord
   * @param {import('discord.js').Client} client - The Discord client
   * @returns {Promise<void>}
   */
  async registerApplicationCommands(client) {
    try {
      if (!client.application) {
        throw new Error('Client application is not ready');
      }

      logger.info('Registering application commands...');
      
      const testGuildId = process.env.TEST_GUILD_ID;
      const commands = [...this.slashCommands, ...this.contextMenus];
      
      if (testGuildId) {
        // Register commands in test guild
        const guild = client.guilds.cache.get(testGuildId);
        if (!guild) {
          throw new Error(`Test guild ${testGuildId} not found`);
        }
        
        await guild.commands.set(commands);
        logger.info(`Registered ${commands.length} commands to test guild ${guild.name}`);
      } else {
        // Register global commands
        await client.application.commands.set(commands);
        logger.info(`Registered ${commands.length} commands globally`);
      }
      
    } catch (error) {
      logger.error('Failed to register application commands:', error);
      throw error;
    }
  }

  /**
   * Handle a message interaction (legacy commands)
   * @param {import('discord.js').Message} message - The message to handle
   * @param {string} prefix - Command prefix
   * @returns {Promise<boolean>} True if a command was handled
   */
  async handleMessage(message, prefix) {
    if (message.author.bot || !message.guild || !message.content.startsWith(prefix)) {
      return false;
    }
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    // Get command (prefixed with 'legacy_' for legacy commands)
    const command = this.getCommand(`legacy_${commandName}`) || this.getCommand(commandName);
    if (!command || !command.isLegacy) {
      return false;
    }
    
    // Check cooldown
    const cooldownInfo = this.isRateLimited(message.author.id);
    if (cooldownInfo.limited) {
      await message.reply(
        `Please wait ${cooldownInfo.remaining} seconds before using another command.`
      ).catch(console.error);
      return true;
    }
    
    // Execute command
    try {
      logger.info(`Executing legacy command: ${command.name} by ${message.author.tag}`);
      await command.execute(message, args);
      return true;
    } catch (error) {
      logger.error(`Error executing legacy command ${command.name}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      if (message.channel.permissionsFor(message.guild.me).has('SEND_MESSAGES')) {
        const reply = await message.reply(`❌ ${errorMessage}`);
        setTimeout(() => reply.deletable && reply.delete().catch(() => {}), 10000);
      }
      
      return true;
    }
  }

  /**
   * Handle a slash command or context menu interaction
   * @param {import('discord.js').Interaction} interaction - The interaction to handle
   * @returns {Promise<boolean>} True if the interaction was handled
   */
  async handleInteraction(interaction) {
    if (!interaction.isCommand() && !interaction.isContextMenuCommand()) {
      return false;
    }

    const command = this.getCommand(interaction.commandName);
    if (!command || command.isLegacy) {
      return false;
    }

    // Check cooldown (skip for bot owner)
    if (interaction.user.id !== interaction.client.application.owner?.id) {
      const cooldownInfo = this.isRateLimited(interaction.user.id);
      if (cooldownInfo.limited) {
        await interaction.reply({
          content: `Please wait ${cooldownInfo.remaining} seconds before using another command.`,
          ephemeral: true
        });
        return true;
      }
    }

    // Execute command
    try {
      logger.info(`Executing slash command: ${command.data.name} by ${interaction.user.tag}`);
      
      if (command.defer) {
        await interaction.deferReply({ ephemeral: command.ephemeral });
      }
      
      await command.execute(interaction, this.client);
      return true;
      
    } catch (error) {
      logger.error(`Error executing slash command ${command.data.name}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ ${errorMessage}`,
          ephemeral: true
        }).catch(console.error);
      } else {
        await interaction.reply({
          content: `❌ ${errorMessage}`,
          ephemeral: true
        }).catch(console.error);
      }
      
      return true;
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
}

// Create and export a singleton instance
const commandHandler = new CommandHandler();

// For backward compatibility
module.exports = commandHandler;
module.exports.CommandHandler = CommandHandler;
