const { Events, EmbedBuilder } = require('discord.js');
const { commandHandler } = require('../handlers/commandHandlerV2');
const logger = require('../utils/logger');

/**
 * Handles incoming messages and processes commands
 * @param {import('discord.js').Message} message - The message that was received
 * @returns {Promise<void>}
 */
async function handleMessageCreate(message) {
    // Ignore messages from bots and webhooks
    if (message.author.bot || message.webhookId) return;

    // Get the prefix from environment or use default
    const prefix = process.env.BOT_PREFIX || '!';
    
    // Check if message starts with the prefix
    if (!message.content.startsWith(prefix)) return;

    try {
        // Parse the command and arguments
        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        // Get the command (prefixed with 'legacy_' for message commands)
        const command = commandHandler.getCommand(`legacy_${commandName}`) || commandHandler.getCommand(commandName);
        if (!command) return;

        // Log command execution
        logger.info(`[COMMAND] ${message.author.tag} (${message.author.id}) executed: ${message.content}`);

        // Check if this is a slash command (V2 style)
        if (command.data) {
            // Create a mock interaction for slash commands
            const mockInteraction = {
                isMessage: () => true,
                guildId: message.guildId,
                guild: message.guild,
                member: message.member,
                user: message.author,
                channel: message.channel,
                reply: async (options) => {
                    if (typeof options === 'string') {
                        return message.channel.send(options);
                    }
                    return message.channel.send(options);
                },
                options: {
                    getSubcommand: () => args[0]?.toLowerCase(),
                    getChannel: (name) => {
                        const channelMention = message.content.match(/<#(\d+)>/);
                        if (channelMention) {
                            return { id: channelMention[1] };
                        }
                        return null;
                    },
                    getRole: (name) => {
                        const roleMention = message.content.match(/<@&(\d+)>/);
                        if (roleMention) {
                            return { id: roleMention[1] };
                        }
                        return null;
                    },
                    getString: (name) => args.find(arg => !arg.startsWith('<')),
                    // Add other necessary methods that might be used by commands
                    getInteger: (name) => {
                        const arg = args.find(arg => !arg.startsWith('<'));
                        return arg ? parseInt(arg, 10) : null;
                    },
                    getBoolean: (name) => {
                        const arg = args.find(arg => !arg.startsWith('<'));
                        return arg ? arg.toLowerCase() === 'true' : null;
                    },
                    getUser: (name) => {
                        const userMention = message.content.match(/<@!?(\d+)>/);
                        if (userMention) {
                            return { id: userMention[1] };
                        }
                        return null;
                    },
                }
            };
            
            return command.execute(mockInteraction);
        }

        // Handle legacy message command (V1 style)
        if (typeof command.execute === 'function') {
            await command.execute(message, message.client, args);
        } else if (command.run) {
            await command.run(message, args);
        } else {
            throw new Error('Command does not have a valid execute or run method');
        }
    } catch (error) {
        logger.error('Error in messageCreate handler:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Error')
            .setDescription('An error occurred while executing that command.')
            .addFields(
                { name: 'Error', value: `\`\`\`${error.message}\`\`\`` }
            )
            .setTimestamp();

        try {
            await message.channel.send({ 
                content: '❌ An error occurred while executing that command.',
                embeds: [errorEmbed] 
            });
        } catch (sendError) {
            logger.error('Failed to send error message:', sendError);
            
            // Fallback to simple reply if embed fails
            try {
                await message.reply({
                    content: '❌ An error occurred while executing that command. Please try again later.',
                    allowedMentions: { repliedUser: false }
                });
            } catch (replyError) {
                logger.error('Failed to send fallback error message:', replyError);
            }
        }
    }
}

module.exports = {
  name: Events.MessageCreate,
  once: false,
  execute: handleMessageCreate
};
