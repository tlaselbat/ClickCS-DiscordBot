const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

/**
 * Creates a new embed with common settings
 * @param {Object} options - Options for the embed
 * @param {string} [options.title] - Title of the embed
 * @param {string} [options.description] - Description of the embed
 * @param {string} [options.color='#0099ff'] - Color of the embed (hex color)
 * @param {Array} [options.fields] - Fields to add to the embed
 * @param {string} [options.thumbnail] - URL of the thumbnail
 * @param {string} [options.image] - URL of the image
 * @param {Object} [options.author] - Author information
 * @param {string} [options.footer] - Footer text
 * @returns {EmbedBuilder} The created embed
 */
function createEmbed({
  title,
  description = '',
  color = '#0099ff',
  fields = [],
  thumbnail,
  image,
  author,
  footer
} = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (author) {
    embed.setAuthor({
      name: author.name,
      iconURL: author.iconURL,
      url: author.url
    });
  }
  if (footer) {
    embed.setFooter({ text: footer });
  }
  
  fields.forEach(field => {
    if (field.name && (field.value || field.value === '')) {
      embed.addFields({
        name: field.name,
        value: field.value,
        inline: field.inline !== undefined ? field.inline : false
      });
    }
  });

  return embed;
}

/**
 * Creates a button component
 * @param {Object} options - Button options
 * @param {string} options.customId - Custom ID for the button
 * @param {string} options.label - Text shown on the button
 * @param {ButtonStyle} [options.style=ButtonStyle.Primary] - Style of the button
 * @param {boolean} [options.disabled=false] - Whether the button is disabled
 * @param {string} [options.emoji] - Emoji to display on the button
 * @param {string} [options.url] - URL for link buttons
 * @returns {ButtonBuilder} The created button
 */
function createButton({
  customId,
  label,
  style = ButtonStyle.Primary,
  disabled = false,
  emoji,
  url
}) {
  const button = new ButtonBuilder()
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (customId) button.setCustomId(customId);
  if (emoji) button.setEmoji(emoji);
  if (url) button.setURL(url);

  return button;
}

/**
 * Creates an action row containing components
 * @param {Array} components - Array of component builders (buttons, select menus, etc.)
 * @returns {ActionRowBuilder} The created action row
 */
function createActionRow(components = []) {
  return new ActionRowBuilder().addComponents(components);
}

/**
 * Creates a pagination row with navigation buttons
 * @param {Object} options - Pagination options
 * @param {string} options.previousId - Custom ID for the previous button
 * @param {string} options.nextId - Custom ID for the next button
 * @param {boolean} [options.hidePrevious=false] - Whether to hide the previous button
 * @param {boolean} [options.hideNext=false] - Whether to hide the next button
 * @returns {ActionRowBuilder} The created action row with pagination buttons
 */
function createPaginationRow({
  previousId,
  nextId,
  hidePrevious = false,
  hideNext = false
}) {
  const components = [];
  
  if (!hidePrevious) {
    components.push(
      createButton({
        customId: previousId,
        label: 'Previous',
        style: ButtonStyle.Secondary,
        emoji: '⬅️'
      })
    );
  }
  
  if (!hideNext) {
    components.push(
      createButton({
        customId: nextId,
        label: 'Next',
        style: ButtonStyle.Primary,
        emoji: '➡️'
      })
    );
  }
  
  return createActionRow(components);
}

module.exports = {
  createEmbed,
  createButton,
  createActionRow,
  createPaginationRow
};
