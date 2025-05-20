/**
 * Command handler for processing Discord messages
 * @module commands/commandHandler
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Command handler class for managing and executing commands
 */
class CommandHandler {
    /**
     * Creates a new CommandHandler instance
     * @param {Client} client - Discord.js client instance
     */
    constructor(client) {
        this.client = client;
        this.commands = new Map();
        this.prefix = process.env.PREFIX || '!';
    }

    /**
     * Loads all command files from the commands directory
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If command loading fails
     */
    async loadCommands() {
        try {
            const commandFiles = await fs.readdir(path.join(__dirname, '../commands'));
            const commandFilesFiltered = commandFiles.filter(file => file.endsWith('.js'));

            for (const file of commandFilesFiltered) {
                const commandPath = path.join(__dirname, '../commands', file);
                const command = require(commandPath);

                if (!command.name || typeof command.execute !== 'function') {
                    logger.warn(`Invalid command format in ${file}`);
                    continue;
                }

                this.commands.set(command.name, command);

                if (command.aliases) {
                    for (const alias of command.aliases) {
                        this.commands.set(alias, command);
                    }
                }
            }

            logger.info(`Loaded ${this.commands.size} commands`);
        } catch (error) {
            logger.error('Error loading commands:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Processes incoming messages and executes commands
     * @param {Message} message - Discord.js message object
     * @returns {Promise<void>}
     */
    async processMessage(message) {
        if (!message.content.startsWith(this.prefix) || message.author.bot) {
            return;
        }

        try {
            const args = message.content.slice(this.prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = this.commands.get(commandName);

            if (!command) {
                return;
            }

            await command.execute(message, args);
        } catch (error) {
            logger.error('Command execution error:', {
                error: error.message,
                stack: error.stack,
                command: commandName,
                user: message.author.tag
            });

            await message.reply('There was an error trying to execute that command!');
        }
    }
}

/**
 * Initialize command handler
 * @param {Client} client - Discord.js client instance
 * @returns {Promise<void>}
 */
module.exports = async (client) => {
    try {
        const handler = new CommandHandler(client);
        await handler.loadCommands();

        client.commands = handler.commands;
        client.on('messageCreate', async (message) => {
            await handler.processMessage(message);
        });

        logger.info('Command handler initialized successfully');
    } catch (error) {
        logger.error('Command handler initialization error:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};