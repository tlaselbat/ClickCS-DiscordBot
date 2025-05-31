const { Collection } = require('discord.js');
const path = require('path');
const { readdir } = require('fs').promises;
const logger = require('../utils/logger');
const { RateLimitError } = require('../utils/errorHandler');

// Command rate limiting (5 commands per 10 seconds per user)
const userCooldowns = new Collection();
const COOLDOWN_AMOUNT = 10 * 1000; // 10 seconds
const MAX_COMMANDS = 5;

class CommandHandler {
  constructor() {
    this.commands = new Collection();
    this.aliases = new Map();
    this.cooldowns = new Collection();
  }

  /**
   * Load all commands from the commands directory
   * @param {string} [directory] - Directory to load commands from
   * @returns {Promise<void>}
   */
  /**
   * Register a command with the handler
   * @param {Object} command - The command to register
   * @param {string} command.name - The name of the command
   * @param {Function} command.execute - The function to execute when the command is called
   * @param {string} [command.description] - Description of the command
   * @param {string[]} [command.aliases=[]] - Aliases for the command
   * @param {boolean} [command.guildOnly=false] - Whether the command can only be used in guilds
   * @param {boolean} [command.ownerOnly=false] - Whether the command can only be used by the bot owner
   * @param {import('discord.js').PermissionResolvable[]} [command.permissions=[]] - Required permissions to use the command
   * @param {boolean} [command.slashCommand=false] - Whether this is a slash command
   * @returns {void}
   */
  registerCommand(command) {
    const commandName = command.slashCommand ? command.name : `legacy_${command.name}`;
    
    if (this.commands.has(commandName)) {
      throw new Error(`A command with the name "${commandName}" is already registered.`);
    }

    this.commands.set(commandName, command);
    
    // Register aliases if they exist
    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        if (this.aliases.has(alias)) {
          console.log(`[WARN] Skipping duplicate alias: ${alias}`);
          continue;
        }
        this.aliases.set(alias, commandName);
        console.log(`[DEBUG] Registered alias: ${alias} -> ${commandName}`);
      }
    }
  }

  async loadCommands(directory = path.join(process.cwd(), 'src/commands')) {
    try {
      const commandsPath = directory;
      console.log(`[DEBUG] Loading commands from: ${commandsPath}`);
      
      // Get all JS files in the directory and subdirectories
      const commandFiles = [];
      const readCommands = async (dir) => {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await readCommands(fullPath);
            } else if (entry.name.endsWith('.js') && 
                     !entry.name.startsWith('_') && 
                     !entry.name.endsWith('.test.js')) {
              commandFiles.push(fullPath);
            }
          }
        } catch (error) {
          console.error(`[ERROR] Failed to read directory ${dir}:`, error);
          throw error;
        }
      };
      
      await readCommands(commandsPath);
      console.log(`[DEBUG] Found command files: ${commandFiles.map(f => path.relative(commandsPath, f)).join(', ')}`);

      for (const filePath of commandFiles) {
        console.log(`[DEBUG] Loading command file: ${filePath}`);
        try {
          // Import the command file
          const commandModule = await import(`file://${filePath.replace(/\\/g, '/')}`);
          
          // Handle default export (common pattern)
          if (commandModule.default) {
            const { data, execute } = commandModule.default;
            if (data && execute) {
              const slashCommand = {
                name: data.name,
                description: data.description || 'No description provided',
                data,
                execute: (interaction) => execute(interaction, interaction.client),
                slashCommand: true
              };
              this.registerCommand(slashCommand);
              logger.debug(`Loaded slash command (default export): ${slashCommand.name}`);
              continue;
            }
          }
          
          // Handle direct exports (alternative pattern)
          if (commandModule.data && commandModule.execute) {
            const slashCommand = {
              name: commandModule.data.name,
              description: commandModule.data.description || 'No description provided',
              data: commandModule.data,
              execute: (interaction) => commandModule.execute(interaction, interaction.client),
              slashCommand: true
            };
            this.registerCommand(slashCommand);
            logger.debug(`Loaded slash command (direct export): ${slashCommand.name}`);
          }
          
          // Handle message command if it exists
          if (commandModule.messageCommand) {
            const { name, execute, ...rest } = commandModule.messageCommand;
            const messageCommand = {
              name,
              execute,
              slashCommand: false,
              ...rest
            };
              
              this.registerCommand(messageCommand);
              logger.debug(`Loaded message command: ${messageCommand.name}`);
            }


          // Handle standalone message commands
          else if (commandModule.messageCommand) {
            const { name, execute, ...rest } = commandModule.messageCommand;
            const messageCommand = {
              name,
              execute,
              slashCommand: false,
              ...rest
            };
            
            this.registerCommand(messageCommand);
            logger.debug(`Loaded message command: ${messageCommand.name}`);
          }
          // Handle legacy format (for backward compatibility)
          else if (commandModule.name && commandModule.execute) {
            const legacyCommand = {
              ...commandModule,
              slashCommand: false
            };
            
            this.registerCommand(legacyCommand);
            logger.debug(`Loaded legacy command: ${legacyCommand.name}`);
          } else {
            logger.warn(`Command in ${filePath} is missing required properties`);
            continue;
          }
        } catch (error) {
          logger.error(`Error loading command ${filePath}`, error);
        }
      }
      
      logger.info(`Successfully loaded ${this.commands.size} commands`);
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
   * @returns {boolean} True if user is rate limited
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
      return true;
    }
    
    // Add current timestamp
    recentCommands.push(now);
    return false;
  }

  /**
   * Handle an incoming message as a potential command
   * @param {import('discord.js').Message} message - The message to handle
   * @param {string} prefix - Command prefix
   * @returns {Promise<boolean>} True if a command was handled
   */
  /**
   * Check if a member has the required permissions for a command
   * @param {import('discord.js').GuildMember} member - The guild member
   * @param {Object} command - The command to check permissions for
   * @returns {Object} Object with hasPermission and errorMessage properties
   */
  checkPermissions(member, command) {
    // Check if command requires specific permissions
    if (command.permissions && command.permissions.length > 0) {
      const missingPerms = [];
      
      for (const perm of command.permissions) {
        if (!member.permissions.has(perm)) {
          const permName = typeof perm === 'string' 
            ? perm.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')
            : Object.entries(PermissionFlagsBits).find(([_, v]) => v === perm)?.[0]
                ?.split('_')
                .map(word => word.charAt(0) + word.slice(1).toLowerCase())
                .join(' ') || 'Unknown';
          
          missingPerms.push(permName);
        }
      }
      
      if (missingPerms.length > 0) {
        return {
          hasPermission: false,
          errorMessage: `❌ You need the following permissions to use this command: ${missingPerms.join(', ')}`
        };
      }
    }
    
    // Check if command is owner-only
    if (command.ownerOnly && member.id !== member.guild.ownerId) {
      return {
        hasPermission: false,
        errorMessage: '❌ This command can only be used by the server owner.'
      };
    }
    
    // Check if command is guild-only
    if (command.guildOnly && !member.guild) {
      return {
        hasPermission: false,
        errorMessage: '❌ This command can only be used in a server.'
      };
    }
    
    return { hasPermission: true };
  }

  async handleMessage(message, prefix) {
    // Ignore messages from bots and DMs
    if (message.author.bot || !message.guild) return false;
    
    // Check if message starts with the prefix
    if (!message.content.startsWith(prefix)) return false;
    
    try {
      // Parse command and arguments
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      
      // Get the command (prefixed with 'legacy_' for message commands)
      const command = this.getCommand(`legacy_${commandName}`) || this.getCommand(commandName);
      if (!command) return false;
      
      // Check if this is a slash command
      if (command.slashCommand) {
        await message.reply({
          content: `This command is only available as a slash command. Use \`/${command.name}\` instead.`,
          allowedMentions: { repliedUser: false }
        });
        return true;
      }
      
      // Check permissions
      const { hasPermission, errorMessage } = this.checkPermissions(message.member, command);
      if (!hasPermission) {
        await message.reply({
          content: errorMessage,
          allowedMentions: { repliedUser: false }
        });
        return true;
      }
      
      // Check rate limiting
      if (this.isRateLimited(message.author.id)) {
        const cooldownTime = Math.ceil(COOLDOWN_AMOUNT / 1000);
        await message.reply({
          content: `You're using commands too quickly. Please wait ${cooldownTime} seconds before using another command.`,
          allowedMentions: { repliedUser: false }
        });
        return true;
      }

      // Check permissions
      if (command.permissions) {
        const hasPermission = await this.checkPermissions(message, command);
        if (!hasPermission) {
          await message.reply('You do not have permission to use this command.');
          return true;
        }
      }

      // Execute the command
      logger.info(`Executing command '${command.name}' for user ${message.author.tag}`);
      await command.execute(message, args);
      return true;
      
    } catch (error) {
      logger.error('Error handling message command', error);
      
      try {
        const errorMessage = error instanceof RateLimitError 
          ? error.message 
          : 'There was an error executing that command. Please try again later.';
          
        if (message.channel.permissionsFor(message.guild.me).has('SEND_MESSAGES')) {
          const reply = await message.reply(errorMessage);
          // Auto-delete error messages after 10 seconds
          setTimeout(() => {
            if (reply.deletable) reply.delete().catch(() => {});
          }, 10000);
        }
      } catch (e) {
        logger.error('Failed to send error message', e);
      }
      
      return true;
    }
  }

  /**
   * Check if a user has permission to use a command
   * @param {import('discord.js').Message} message - The message that triggered the command
   * @param {Object} command - The command to check
   * @returns {Promise<boolean>} True if user has permission
   */
  async checkPermissions(message, command) {
    // Owner bypass
    if (command.ownerOnly && message.author.id !== message.client.ownerId) {
      return false;
    }

    // Check user permissions
    if (command.userPermissions) {
      const missingPermissions = message.channel.permissionsFor(message.author)
        .missing(command.userPermissions);
      
      if (missingPermissions.length > 0) {
        return false;
      }
    }

    // Check bot permissions
    if (command.botPermissions) {
      const missingPermissions = message.channel.permissionsFor(message.guild.me)
        .missing(command.botPermissions);
      
      if (missingPermissions.length > 0) {
        return false;
      }
    }

    // Check role-based permissions
    if (command.requiredRoles && command.requiredRoles.length > 0) {
      const member = await message.guild.members.fetch(message.author.id);
      const hasRole = command.requiredRoles.some(roleId => 
        member.roles.cache.has(roleId)
      );
      
      if (!hasRole) {
        return false;
      }
    }

    return true;
  }
}

// Export a singleton instance
const commandHandler = new CommandHandler();

module.exports = commandHandler;
