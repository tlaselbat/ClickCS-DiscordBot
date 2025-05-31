const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ApplicationCommandOptionType
} = require('discord.js');
const { withInteractionErrorHandling } = require('./errorUtils');
const logger = require('./logger');

// Helper constants for common Discord.js values
const DEFAULT_EMBED_COLOR = 0x5865F2; // Discord blurple
const DEFAULT_TIMEOUT = 300000; // 5 minutes
const DEFAULT_PAGE_TIMEOUT = 60000; // 1 minute

/**
 * Creates a new slash command builder with common options
 * @param {Object} options - Command options
 * @param {string} options.name - Command name
 * @param {string} options.description - Command description
 * @param {boolean} [options.guildOnly=false] - Whether the command is guild-only
 * @param {boolean} [options.defaultPermission=true] - Whether the command is enabled by default
 * @param {import('discord.js').PermissionResolvable[]} [options.permissions=[]] - Required permissions to use the command
 * @returns {import('discord.js').SlashCommandBuilder} Configured slash command builder
 */
function createSlashCommand({
  name,
  description,
  guildOnly = false,
  defaultPermission = true,
  permissions = [],
}) {
  const command = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(
      defaultPermission ? null : PermissionFlagsBits.Administrator
    );

  if (guildOnly) command.setDMPermission(false);
  if (permissions.length > 0) command.setDefaultMemberPermissions(permissions.reduce((acc, p) => acc | p, 0));

  return command;
}

/**
 * Creates an embed with common styling
 * @param {Object} options - Embed options
 * @returns {import('discord.js').EmbedBuilder} Styled embed
 */
function createEmbed({
  title = '',
  description = '',
  color = DEFAULT_EMBED_COLOR,
  fields = [],
  footer = {},
  thumbnail = null,
  image = null,
  timestamp = true,
  author = null,
  url = null,
} = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);

  if (fields.length > 0) embed.addFields(fields);
  if (footer.text || footer.iconURL) embed.setFooter({ text: footer.text || '\u200b', iconURL: footer.iconURL });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (timestamp) embed.setTimestamp();
  if (author) embed.setAuthor({ name: author.name, iconURL: author.iconURL, url: author.url });
  if (url) embed.setURL(url);

  return embed;
}

/**
 * Creates a button component
 * @param {Object} options - Button options
 * @returns {import('discord.js').ButtonBuilder} Button component
 */
function createButton({
  customId,
  label,
  style = ButtonStyle.Primary,
  emoji = null,
  disabled = false,
  url = null,
}) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(url ? ButtonStyle.Link : style)
    .setDisabled(disabled);

  if (emoji) button.setEmoji(emoji);
  if (url) button.setURL(url);

  return button;
}

/**
 * Creates a modal dialog
 * @param {Object} options - Modal options
 * @returns {import('discord.js').ModalBuilder} Modal dialog
 */
function createModal({
  customId,
  title,
  components = [],
  onSuccess = () => {},
  onError = (error) => { throw error; },
} = {}) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title);

  if (components.length > 0) {
    const actionRows = components.map(component => new ActionRowBuilder().addComponents(component));
    modal.addComponents(...actionRows);
  }

  if (onSuccess || onError) {
    modal.onSubmit = withInteractionErrorHandling(async interaction => {
      try {
        await onSuccess(interaction);
      } catch (error) {
        await onError(error, interaction);
      }
    });
  }

  return modal;
}

/**
 * Creates a text input component for modals
 * @param {Object} options - Text input options
 * @returns {import('discord.js').TextInputBuilder} Text input component
 */
function createTextInput({
  customId,
  label,
  style = TextInputStyle.Short,
  minLength = 1,
  maxLength = 4000,
  placeholder = '',
  required = true,
  value = '',
}) {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setMinLength(minLength)
    .setMaxLength(maxLength)
    .setPlaceholder(placeholder)
    .setRequired(required)
    .setValue(value);
}

/**
 * Creates a select menu component
 * @param {Object} options - Select menu options
 * @returns {import('discord.js').StringSelectMenuBuilder} Select menu component
 */
function createSelectMenu({
  customId,
  placeholder = 'Select an option',
  minValues = 1,
  maxValues = 1,
  disabled = false,
  options = [],
} = {}) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(minValues)
    .setMaxValues(maxValues)
    .setDisabled(disabled);

  if (options.length > 0) menu.addOptions(options);

  return menu;
}

/**
 * Creates a paginated embed with navigation buttons
 * @param {Object} options - Pagination options
 * @returns {Object} Pagination controls and embed
 */
function createPaginatedEmbed({
  pages = [],
  page = 0,
  timeout = DEFAULT_TIMEOUT,
  filter = () => true,
  onPageChange = () => {},
  onEnd = () => {},
} = {}) {
  if (!pages.length) throw new Error('No pages provided for pagination');

  const createNavigationButton = (id, label, disabled) =>
    createButton({
      customId: id,
      label,
      style: ButtonStyle.Secondary,
      disabled,
    });

  // Create buttons
  const firstButton = createNavigationButton('first', '<<', page === 0);
  const prevButton = createNavigationButton('prev', '<', page === 0);
  const nextButton = createNavigationButton('next', '>', page === pages.length - 1);
  const lastButton = createNavigationButton('last', '>>', page === pages.length - 1);

  // Create action row with buttons
  const row = new ActionRowBuilder().addComponents(firstButton, prevButton, nextButton, lastButton);

  // Create initial embed and update footer
  const embed = pages[page];
  const footerText = embed.data.footer?.text || '';
  embed.setFooter({
    text: `${footerText} | Page ${page + 1}/${pages.length}`.trim(),
    iconURL: embed.data.footer?.iconURL,
  });

  return {
    embed,
    components: [row],
    collectFilter: filter,
    time: timeout,
    onPageChange,
    onEnd,
  };
}

/**
 * Creates a confirmation dialog
 * @param {Object} options - Confirmation options
 * @returns {Promise<boolean>} Whether the user confirmed
 */
function createConfirmation({
  interaction,
  question = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmStyle = ButtonStyle.Danger,
  cancelStyle = ButtonStyle.Secondary,
  ephemeral = true,
  timeout = DEFAULT_PAGE_TIMEOUT,
}) {
  const confirmButton = createButton({
    customId: 'confirm',
    label: confirmLabel,
    style: confirmStyle,
  });

  const cancelButton = createButton({
    customId: 'cancel',
    label: cancelLabel,
    style: cancelStyle,
  });

  const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

  return interaction.reply({
    content: question,
    components: [row],
    fetchReply: true,
    ephemeral,
  }).then(message => {
    const collector = message.createMessageComponentCollector({
      componentType: 'BUTTON',
      time: timeout,
    });

    collector.on('collect', async i => {
      await i.update({
        components: [row.components.map(c => c.setDisabled(true))],
      });
      resolve(i.customId === 'confirm');
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        await message.edit({
          components: [row.components.map(c => c.setDisabled(true))],
        });
      }
    });

    return collector;
  });
}

/**
 * Helper to create command options
 */
const OptionType = {
  String: ApplicationCommandOptionType.String,
  Integer: ApplicationCommandOptionType.Integer,
  Boolean: ApplicationCommandOptionType.Boolean,
  User: ApplicationCommandOptionType.User,
  Channel: ApplicationCommandOptionType.Channel,
  Role: ApplicationCommandOptionType.Role,
  Mentionable: ApplicationCommandOptionType.Mentionable,
  Number: ApplicationCommandOptionType.Number,
  Attachment: ApplicationCommandOptionType.Attachment,
};

/**
 * Adds an option to a slash command
 * @param {import('discord.js').SlashCommandBuilder} command - The command to add the option to
 * @param {Object} option - The option to add
 * @returns {import('discord.js').SlashCommandBuilder} The command with the option added
 */
function addOption(command, {
  type,
  name,
  description,
  required = true,
  choices = [],
  channelTypes = [],
  minValue,
  maxValue,
  autocomplete = false,
}) {
  const methodMap = {
    [OptionType.String]: 'addStringOption',
    [OptionType.Integer]: 'addIntegerOption',
    [OptionType.Boolean]: 'addBooleanOption',
    [OptionType.User]: 'addUserOption',
    [OptionType.Channel]: 'addChannelOption',
    [OptionType.Role]: 'addRoleOption',
    [OptionType.Mentionable]: 'addMentionableOption',
    [OptionType.Number]: 'addNumberOption',
    [OptionType.Attachment]: 'addAttachmentOption',
  };

  const method = methodMap[type];
  if (!method) {
    throw new Error(`Invalid option type: ${type}`);
  }

  const option = option => {
    option
      .setName(name)
      .setDescription(description)
      .setRequired(required);

    if (choices.length > 0) {
      option.addChoices(...choices);
    }

    if (channelTypes.length > 0) {
      option.addChannelTypes(...channelTypes);
    }

    if (minValue !== undefined) {
      option.setMinValue(minValue);
    }

    if (maxValue !== undefined) {
      option.setMaxValue(maxValue);
    }

    if (autocomplete) {
      option.setAutocomplete(true);
    }

    return option;
  };

  return command[method](option);
}

/**
 * Creates a command handler for slash commands
 * @param {Object} options - Command handler options
 * @returns {Object} Command handler
 */
function createCommandHandler({
  data,
  execute,
  autocomplete,
  permissions = [],
  guildOnly = false,
  ownerOnly = false,
  cooldown = 0,
}) {
  const cooldowns = new Map();

  return {
    data,
    async execute(interaction) {
      try {
        // Check if command is guild-only
        if (guildOnly && !interaction.inGuild()) {
          return interaction.reply({
            content: 'This command can only be used in a server.',
            ephemeral: true,
          });
        }


        // Check if command is owner-only
        if (ownerOnly && interaction.user.id !== interaction.client.application.owner?.id) {
          return interaction.reply({
            content: 'This command can only be used by the bot owner.',
            ephemeral: true,
          });
        }

        // Check permissions
        if (permissions.length > 0) {
          const member = await interaction.guild?.members.fetch(interaction.user.id);
          if (!member?.permissions.has(permissions)) {
            return interaction.reply({
              content: `You need the following permissions to use this command: ${permissions.join(', ')}`,
              ephemeral: true,
            });
          }
        }

        // Handle cooldowns
        if (cooldown > 0) {
          const now = Date.now();
          const cooldownKey = `${interaction.user.id}-${data.name}`;
          const cooldownEnd = cooldowns.get(cooldownKey) || 0;

          if (now < cooldownEnd) {
            const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
            return interaction.reply({
              content: `Please wait ${timeLeft} more second(s) before using this command again.`,
              ephemeral: true,
            });
          }

          cooldowns.set(cooldownKey, now + cooldown);
          setTimeout(() => cooldowns.delete(cooldownKey), cooldown);
        }

        // Execute the command
        return await execute(interaction);
      } catch (error) {
        logger.error(`Error executing command ${data.name}`, { error, interaction });
        
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
        
        return interaction.followUp({
          content: 'An error occurred while executing this command.',
          ephemeral: true,
        });
      }
    },
    autocomplete: autocomplete 
      ? async (interaction) => {
          try {
            return await autocomplete(interaction);
          } catch (error) {
            logger.error(`Error in autocomplete for command ${data.name}`, { error });
            return [];
          }
        }
      : undefined,
  };
}
// Export all functions and constants
module.exports = {
  createSlashCommand,
  createEmbed,
  createButton,
  createModal,
  createTextInput,
  createSelectMenu,
  createPaginatedEmbed,
  createConfirmation,
  OptionType,
  addOption,
  createCommandHandler
};
