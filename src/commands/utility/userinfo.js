const { ApplicationCommandType, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');
const { createCommandHandler } = require('../../utils/interactionUtils');
const { createEmbed, createButton, createActionRow } = require('../../utils/embedUtils');
const { handleError } = require('../../utils/errorUtils');
const { isDev } = require('../../utils/env');

// Helper function to format permissions
function formatPermissions(permissions) {
  if (!permissions) return 'None';
  
  const permissionNames = Object.entries(PermissionFlagsBits)
    .filter(([_, value]) => (permissions & value) === value)
    .map(([name]) => name)
    .map(name => name.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    );

  return permissionNames.length > 0 
    ? permissionNames.join(', ')
    : 'None';
}

// Helper function to format date
function formatDate(date) {
  if (!date) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
}

const command = createCommandHandler({
  // Command data
  data: {
    name: 'userinfo',
    description: 'Get information about a user',
    options: [
      {
        name: 'user',
        description: 'The user to get information about',
        type: ApplicationCommandOptionType.User,
        required: false
      },
      {
        name: 'show_roles',
        description: 'Whether to show all roles (can be long)',
        type: ApplicationCommandOptionType.Boolean,
        required: false
      }
    ],
    defaultMemberPermissions: PermissionFlagsBits.ViewChannel,
    dmPermission: false
  },
  
  // Command execution
  execute: async (interaction) => {
    try {
      // Defer the reply to give us more time to process
      await interaction.deferReply();

      // Get the target user (defaults to the command user)
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const showRoles = interaction.options.getBoolean('show_roles') || false;
      
      // Fetch the member for guild-specific information
      const member = interaction.guild.members.cache.get(targetUser.id) || 
                    await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      // Basic user information
      const userInfo = {
        '👤 Username': `${targetUser.tag} ${targetUser.bot ? '🤖' : ''}`,
        '🆔 User ID': targetUser.id,
        '📅 Account Created': formatDate(targetUser.createdAt),
        '🎨 Accent Color': targetUser.hexAccentColor || 'Default',
        '📱 Mobile Status': targetUser.presence?.status || 'offline',
        '🌐 Avatar': `[Link](${targetUser.displayAvatarURL({ size: 4096, dynamic: true })})`
      };

      // Guild-specific member information
      let memberInfo = {};
      if (member) {
        memberInfo = {
          '👋 Nickname': member.nickname || 'None',
          '🎭 Display Name': member.displayName,
          '🚪 Joined Server': formatDate(member.joinedAt),
          '👑 Server Owner': interaction.guild.ownerId === member.id ? 'Yes' : 'No',
          '🚀 Boosting Since': member.premiumSince ? formatDate(member.premiumSince) : 'Not boosting',
          '🔐 Timeout': member.communicationDisabledUntilTimestamp 
            ? `Until <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>`
            : 'Not timed out',
          '🔑 Permissions': formatPermissions(member.permissions.bitfield)
        };
      }

      // Create the main embed
      const embed = createEmbed({
        title: `User Information: ${targetUser.username}`,
        thumbnail: targetUser.displayAvatarURL({ size: 1024, dynamic: true }),
        color: targetUser.accentColor || 0x5865F2,
        fields: [
          {
            name: 'User Information',
            value: Object.entries(userInfo)
              .map(([key, value]) => `**${key}:** ${value}`)
              .join('\n'),
            inline: true
          },
          {
            name: 'Member Information',
            value: Object.entries(memberInfo)
              .map(([key, value]) => `**${key}:** ${value}`)
              .join('\n'),
            inline: true
          }
        ]
      });

      // Add roles field if requested and member is in the guild
      if (showRoles && member) {
        const roles = member.roles.cache
          .sort((a, b) => b.position - a.position)
          .map(role => role.toString())
          .join(' ');

        if (roles) {
          embed.addFields({
            name: `Roles [${member.roles.cache.size - 1}]`,
            value: roles.length > 1000 
              ? `${roles.substring(0, 1000)}... (truncated)` 
              : roles || 'No roles',
            inline: false
          });
        }
      }

      // Create action row with buttons
      const actionRow = createActionRow([
        createButton({
          customId: 'avatar',
          label: 'View Avatar',
          style: 'Secondary',
          emoji: '🖼️'
        }),
        createButton({
          customId: 'banner',
          label: 'View Banner',
          style: 'Secondary',
          emoji: '🏞️',
          disabled: !targetUser.bannerURL()
        })
      ]);

      // Send the response
      await interaction.editReply({
        embeds: [embed],
        components: [actionRow]
      });

      // Set up button collector
      const filter = (i) => i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({
        filter,
        time: 300000, // 5 minutes
        max: 5
      });

      collector.on('collect', async (i) => {
        try {
          if (i.customId === 'avatar') {
            const avatarEmbed = createEmbed({
              title: `${targetUser.username}'s Avatar`,
              image: targetUser.displayAvatarURL({ size: 4096, dynamic: true }),
              color: targetUser.accentColor || 0x5865F2
            });

            await i.reply({
              embeds: [avatarEmbed],
              ephemeral: true
            });
          } else if (i.customId === 'banner' && targetUser.bannerURL()) {
            const bannerEmbed = createEmbed({
              title: `${targetUser.username}'s Banner`,
              image: targetUser.bannerURL({ size: 4096, dynamic: true }),
              color: targetUser.accentColor || 0x5865F2
            });

            await i.reply({
              embeds: [bannerEmbed],
              ephemeral: true
            });
          }
        } catch (error) {
          handleError(error, { interaction: i });
        }
      });

      collector.on('end', () => {
        // Disable buttons when collector ends
        actionRow.components.forEach(component => component.setDisabled(true));
        interaction.editReply({ components: [actionRow] }).catch(() => {});
      });

    } catch (error) {
      // Use our error handler
      await handleError(error, { 
        interaction,
        logError: !isDev() // Only log in production
      });
    }
  },
  
  // Command cooldown (in milliseconds)
  cooldown: 5000,
  
  // Required permissions to use this command
  permissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages
  ],
  
  // Whether the command is only available to bot owners
  ownerOnly: false,
  
  // Whether the command is only available in guilds
  guildOnly: true
});

// Export for the command loader
module.exports = command;
