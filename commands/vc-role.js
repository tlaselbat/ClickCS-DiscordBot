/**
 * Command to toggle VC role assignment
 * @module commands/vc-role
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { Permissions } = require('discord.js');

/**
 * @typedef {Object} VCConfig
 * @property {boolean} enabled - Whether VC role assignment is enabled
 * @property {string} roleId - ID of the role to assign
 */

/**
 * Command configuration
 * @type {Object}
 */
const command = {
    data: new SlashCommandBuilder()
        .setName('vc-role')
        .setDescription('Toggle VC role assignment')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('Enable or disable VC role assignment')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to assign when in VC')
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
        const role = options.getRole('role');

        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            return interaction.reply({ content: 'You need Manage Roles permission to use this command', ephemeral: true });
        }

        try {
            const config = await client.config.getVCConfig(guild.id);

            if (enable) {
                if (!role) {
                    return interaction.reply({ content: 'Please specify a role when enabling VC role assignment', ephemeral: true });
                }
                config.enabled = true;
                config.roleId = role.id;
                await client.config.saveVCConfig(guild.id, config);
                interaction.reply(`VC role assignment enabled for role <@&${role.id}>`);
            } else {
                config.enabled = false;
                await client.config.saveVCConfig(guild.id, config);
                interaction.reply('VC role assignment disabled');
            }
        } catch (error) {
            interaction.reply({ content: 'Failed to update VC role settings', ephemeral: true });
            throw error;
        }
    },
};

module.exports = command;
