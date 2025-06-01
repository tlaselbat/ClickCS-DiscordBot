const { 
  Events, 
  EmbedBuilder, 
  PermissionFlagsBits,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const logger = require('../utils/logger');
const commandHandler = require('../handlers/commandHandler');
const { handleError } = require('../utils/errorUtils');
const { createEmbed, createButton, createActionRow } = require('../utils/embedUtils');
const { isDev, env } = require('../utils/env');

// Cooldown for error messages to prevent spam
const errorCooldowns = new Map();
const ERROR_COOLDOWN = 5000; // 5 seconds

/**
 * Check if a user is on cooldown for error messages
 * @param {string} userId - The user's ID
 * @returns {boolean} True if the user is on cooldown
 */
function isOnErrorCooldown(userId) {
  const now = Date.now();
  const cooldownEnd = errorCooldowns.get(userId) || 0;
  
  if (now < cooldownEnd) {
    return true;
  }
  
  errorCooldowns.set(userId, now + ERROR_COOLDOWN);
  return false;
}

/**
 * Handle button interactions
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @returns {Promise<void>}
 */
async function handleButton(interaction) {
  try {
    logger.debug(`Button clicked: ${interaction.customId} by ${interaction.user.tag}`);
    
    // Handle common button patterns
    const [action, ...params] = interaction.customId.split(':');
    
    switch (action) {
      case 'delete':
        // Only allow the original user or admins to delete
        if (interaction.message.interaction?.user.id === interaction.user.id ||
            interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
          await interaction.message.delete().catch(() => {});
        } else {
          await interaction.reply({
            content: '❌ You can only delete your own messages.',
            ephemeral: true
          });
        }
        break;
        
      case 'confirm':
      case 'cancel':
        // Handle confirmation dialogs
        await handleConfirmation(interaction, action, params);
        break;
        
      default:
        // Custom button handlers can be added here
        logger.debug(`Unhandled button: ${interaction.customId}`);
        if (!interaction.replied) {
          await interaction.reply({
            content: 'This button is not yet implemented.',
            ephemeral: true
          });
        }
    }
  } catch (error) {
    logger.error('Error handling button interaction:', error);
    await handleError(error, { interaction });
  }
}

/**
 * Handle confirmation dialogs
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @param {string} action - The action (confirm/cancel)
 * @param {string[]} params - Additional parameters
 * @returns {Promise<void>}
 */
async function handleConfirmation(interaction, action, params) {
  const [messageId] = params;
  const isConfirmed = action === 'confirm';
  
  // Disable all buttons
  const rows = interaction.message.components.map(row => {
    return new ActionRowBuilder().addComponents(
      row.components.map(component => {
        return ButtonBuilder.from(component).setDisabled(true);
      })
    );
  });
  
  await interaction.update({ components: rows });
  
  // Emit an event that the confirmation was handled
  interaction.client.emit('confirmation', {
    messageId: messageId || interaction.message.id,
    confirmed: isConfirmed,
    interaction
  });
  
  // Send a follow-up message
  const response = isConfirmed ? 'confirmed' : 'cancelled';
  await interaction.followUp({
    content: `✅ Operation ${response}.`,
    ephemeral: true
  });
}

/**
 * Handle select menu interactions
 * @param {import('discord.js').SelectMenuInteraction} interaction - The select menu interaction
 * @returns {Promise<void>}
 */
async function handleSelectMenu(interaction) {
  try {
    logger.debug(`Select menu used: ${interaction.customId} by ${interaction.user.tag}`);
    
    // Handle common select menu patterns
    const [action, ...params] = interaction.customId.split(':');
    
    switch (action) {
      case 'pagination':
        // Handle pagination
        await handlePagination(interaction, params);
        break;
        
      case 'settings':
        // Handle settings menu
        await handleSettingsMenu(interaction, params);
        break;
        
      default:
        logger.debug(`Unhandled select menu: ${interaction.customId}`);
        if (!interaction.replied) {
          await interaction.reply({
            content: 'This selection is not yet implemented.',
            ephemeral: true
          });
        }
    }
  } catch (error) {
    logger.error('Error handling select menu interaction:', error);
    await handleError(error, { interaction });
  }
}

/**
 * Handle pagination
 * @param {import('discord.js').SelectMenuInteraction} interaction - The select menu interaction
 * @param {string[]} params - Additional parameters
 * @returns {Promise<void>}
 */
async function handlePagination(interaction, params) {
  const [page] = params;
  // Implementation would depend on your pagination system
  await interaction.update({
    content: `Page ${page} selected`,
    components: interaction.message.components // Keep existing components
  });
}

/**
 * Handle settings menu
 * @param {import('discord.js').SelectMenuInteraction} interaction - The select menu interaction
 * @param {string[]} params - Additional parameters
 * @returns {Promise<void>}
 */
async function handleSettingsMenu(interaction, params) {
  const [setting, value] = interaction.values[0].split(':');
  
  // Here you would update the setting in your database
  // For now, we'll just acknowledge the selection
  await interaction.update({
    content: `Setting **${setting}** updated to: ${value}`,
    components: [] // Remove the select menu after selection
  });
}

/**
 * Handle modal submissions
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission
 * @returns {Promise<void>}
 */
async function handleModalSubmit(interaction) {
  try {
    logger.debug(`Modal submitted: ${interaction.customId} by ${interaction.user.tag}`);
    
    // Handle common modal patterns
    const [action, ...params] = interaction.customId.split(':');
    
    switch (action) {
      case 'feedback':
        await handleFeedback(interaction, params);
        break;
        
      case 'report':
        await handleReport(interaction, params);
        break;
        
      default:
        logger.debug(`Unhandled modal: ${interaction.customId}`);
        if (!interaction.replied) {
          await interaction.reply({
            content: 'This form is not yet implemented.',
            ephemeral: true
          });
        }
    }
  } catch (error) {
    logger.error('Error handling modal submission:', error);
    await handleError(error, { interaction });
  }
}

/**
 * Handle feedback submission
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission
 * @param {string[]} params - Additional parameters
 * @returns {Promise<void>}
 */
async function handleFeedback(interaction, params) {
  const feedback = interaction.fields.getTextInputValue('feedback');
  
  // Here you would save the feedback to your database
  // For now, we'll just acknowledge it
  await interaction.reply({
    content: '✅ Thank you for your feedback!',
    ephemeral: true
  });
  
  // Log the feedback
  logger.info(`Feedback from ${interaction.user.tag} (${interaction.user.id}): ${feedback}`);
  
  // Optionally, send to a feedback channel
  const feedbackChannel = interaction.client.channels.cache.get(env.FEEDBACK_CHANNEL_ID);
  if (feedbackChannel) {
    const embed = createEmbed({
      title: 'New Feedback',
      description: feedback,
      color: Colors.Blurple,
      fields: [
        { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Guild', value: interaction.guild?.name || 'DM', inline: true }
      ]
    });
    
    await feedbackChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

/**
 * Handle report submission
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission
 * @param {string[]} params - Additional parameters
 * @returns {Promise<void>}
 */
async function handleReport(interaction, params) {
  const [reportType] = params;
  const details = interaction.fields.getTextInputValue('details');
  const evidence = interaction.fields.getTextInputValue('evidence') || 'No evidence provided';
  
  // Here you would process the report
  await interaction.reply({
    content: '✅ Your report has been submitted. Thank you!',
    ephemeral: true
  });
  
  // Log the report
  logger.info(`Report from ${interaction.user.tag} (${interaction.user.id}): ${reportType} - ${details}`);
  
  // Send to moderation channel
  const reportChannel = interaction.client.channels.cache.get(env.REPORT_CHANNEL_ID);
  if (reportChannel) {
    const embed = createEmbed({
      title: `New ${reportType} Report`,
      description: details,
      color: Colors.Red,
      fields: [
        { name: 'Reporter', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Guild', value: interaction.guild?.name || 'DM', inline: true },
        { name: 'Evidence', value: evidence }
      ]
    });
    
    const row = createActionRow([
      createButton({
        customId: `report:action:${interaction.id}:warn`,
        label: 'Warn User',
        style: 'Danger'
      }),
      createButton({
        customId: `report:action:${interaction.id}:dismiss`,
        label: 'Dismiss',
        style: 'Secondary'
      })
    ]);
    
    await reportChannel.send({ 
      content: `<@&${env.MOD_ROLE_ID}>`, 
      embeds: [embed],
      components: [row]
    }).catch(() => {});
  }
}

/**
 * Handle autocomplete interactions
 * @param {import('discord.js').AutocompleteInteraction} interaction - The autocomplete interaction
 * @returns {Promise<void>}
 */
async function handleAutocomplete(interaction) {
  try {
    const { commandName, options } = interaction;
    const focused = options.getFocused(true);
    
    // Get the command
    const command = commandHandler.getCommand(commandName);
    
    if (!command || !command.autocomplete) {
      return interaction.respond([]);
    }
    
    // Execute the autocomplete handler
    const choices = await command.autocomplete(interaction, focused);
    
    // Ensure choices are in the correct format
    const formattedChoices = choices.map(choice => {
      if (typeof choice === 'string') {
        return { name: choice, value: choice };
      }
      return choice;
    });
    
    await interaction.respond(formattedChoices);
  } catch (error) {
    logger.error('Error handling autocomplete:', error);
    
    // If we can't respond, just ignore the error
    if (interaction.responded) return;
    
    try {
      await interaction.respond([]);
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Main interaction handler
 * @param {import('discord.js').Interaction} interaction - The interaction to handle
 * @returns {Promise<void>}
 */
async function handleInteraction(interaction) {
  // Don't respond to other bots
  if (interaction.user.bot) return;
  
  try {
    // Handle different interaction types
    if (interaction.isChatInputCommand()) {
      await commandHandler.handleInteraction(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isContextMenuCommand()) {
      await commandHandler.handleInteraction(interaction);
    } else if (interaction.isMessageContextMenuCommand()) {
      // Handle message context menu commands
      logger.debug(`Message context menu used: ${interaction.commandName}`);
      // Implementation would be similar to handleSlashCommand
    } else if (interaction.isUserContextMenuCommand()) {
      // Handle user context menu commands
      logger.debug(`User context menu used: ${interaction.commandName}`);
      // Implementation would be similar to handleSlashCommand
    }
  } catch (error) {
    // Only log the error if we're not on cooldown
    if (!isOnErrorCooldown(interaction.user.id)) {
      logger.error('Unhandled error in interaction handler:', error);
    }
    
    // Try to send an error response
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ An error occurred while processing your interaction.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while processing your interaction.',
          ephemeral: true
        });
      }
    } catch (e) {
      // If we can't reply, just log the error
      logger.error('Failed to send error response:', e);
    }
  }
}

// Export the event handler
module.exports = {
  name: 'interactionCreate',
  execute: handleInteraction
};
