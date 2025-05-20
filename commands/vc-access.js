/**
 * Command to toggle VC channel access
 * @module commands/vc-access
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { Permissions } = require('discord.js');

/**
 * @typedef {Object} VCConfig
 * @property {boolean} enabled - Whether VC access is enabled
 * @property {string} channelId - ID of the channel to grant access to
 */

/**
 * Command configuration
 * @type {Object}
 */
const command = {
    data: new SlashCommandBuilder()
        .setName('vc-access')
        .setDescription('Toggle VC channel access')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('Enable or disable VC access')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to grant access to when in VC')
                .setRequired(false)),

    /**
     * Execute the command
     * @param {Discord.CommandInteraction} interaction - The interaction object
     * @param {Discord.Client} client - Discord client instance
     * @returns {Promise<void>}
     */
    async execute(interaction, client) {
        const { options, guild } = interaction;
        const enable = options.getBoolean('enable');
        const channel = options.getChannel('channel');

        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
            return interaction.reply({ content: 'You need Manage Channels permission to use this command', ephemeral: true });
        }

        try {
            const config = await client.config.getVCConfig(guild.id);

            if (enable) {
                if (!channel) {
                    return interaction.reply({ content: 'Please specify a channel when enabling VC access', ephemeral: true });
                }
                config.enabled = true;
                config.channelId = channel.id;
                await client.config.saveVCConfig(guild.id, config);
                interaction.reply(`VC access enabled for channel <#${channel.id}>`);
            } else {
                config.enabled = false;
                await client.config.saveVCConfig(guild.id, config);
                interaction.reply('VC access disabled');
            }
        } catch (error) {
            interaction.reply({ content: 'Failed to update VC access settings', ephemeral: true });
            throw error;
        }
    },
};

module.exports = command;
