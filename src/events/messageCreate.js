const { Events, EmbedBuilder } = require('discord.js');
const commandHandler = require('../handlers/commandHandler');
const logger = require('../utils/logger');

/**
 * Handles incoming messages and processes legacy commands
 * @param {import('discord.js').Message} message - The message that was received
 * @returns {Promise<void>}
 */
async function handleMessageCreate(message) {
    // Ignore messages from bots and webhooks
    if (message.author.bot || message.webhookId) return;

    // Get the prefix from environment or use default
    const prefix = process.env.BOT_PREFIX || '!';
    
    // Let the command handler process the message
    try {
        const handled = await commandHandler.handleMessage(message, prefix);
        if (handled) {
            logger.info(`[COMMAND] ${message.author.tag} (${message.author.id}) executed: ${message.content}`);
        }
    } catch (error) {
        logger.error('Error in messageCreate handler:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Error')
            .setDescription('An error occurred while processing that command.')
            .addFields(
                { name: 'Error', value: `\`\`\`${error.message}\`\`\`` }
            )
            .setTimestamp();

        try {
            await message.channel.send({ 
                content: '❌ An error occurred while processing that command.',
                embeds: [errorEmbed] 
            });
        } catch (sendError) {
            logger.error('Failed to send error message:', sendError);
            
            // Fallback to simple reply if embed fails
            try {
                await message.reply({
                    content: '❌ An error occurred while processing that command. Please try again later.',
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
