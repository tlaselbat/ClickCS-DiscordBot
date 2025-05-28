/**
 * Command to manage VC role blacklist
 * @module commands/blacklist
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

/**
 * Command configuration
 * @type {Object}
 */
const command = {
    data: new SlashCommandBuilder()
        .setName('vc-blacklist')
        .setDescription('Manage VC role blacklist')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the blacklist')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to add to blacklist')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the blacklist')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to remove from blacklist')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all blacklisted users'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable the blacklist')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Whether to enable or disable the blacklist')
                        .setRequired(true))),

    /**
     * Execute the command
     * @param {Discord.CommandInteraction} interaction - The interaction object
     * @param {Discord.Client} client - Discord client instance
     * @returns {Promise<void>}
     */
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        
        try {
            // Get current config
            const config = await client.config.getVCConfig(guildId);
            
            // Ensure blacklist config exists
            if (!config.blacklist) {
                config.blacklist = {
                    enabled: true,
                    adminBlacklisted: true,
                    users: []
                };
            }
            
            switch (subcommand) {
                case 'add': {
                    const user = interaction.options.getUser('user');
                    if (config.blacklist.users.includes(user.id)) {
                        return interaction.reply({ content: 'User is already blacklisted', ephemeral: true });
                    }
                    config.blacklist.users.push(user.id);
                    await client.config.saveVCConfig(guildId, config);
                    return interaction.reply({ content: `Added ${user.tag} to the blacklist`, ephemeral: true });
                }
                
                case 'remove': {
                    const user = interaction.options.getUser('user');
                    if (!config.blacklist.users.includes(user.id)) {
                        return interaction.reply({ content: 'User is not in the blacklist', ephemeral: true });
                    }
                    config.blacklist.users = config.blacklist.users.filter(id => id !== user.id);
                    await client.config.saveVCConfig(guildId, config);
                    return interaction.reply({ content: `Removed ${user.tag} from the blacklist`, ephemeral: true });
                }
                
                case 'list': {
                    if (config.blacklist.users.length === 0) {
                        return interaction.reply({ content: 'No users are blacklisted', ephemeral: true });
                    }
                    const userList = config.blacklist.users.map(id => `<@${id}>`).join('\n');
                    return interaction.reply({ 
                        content: `**Blacklisted Users:**\n${userList}\n\n**Total:** ${config.blacklist.users.length}`, 
                        ephemeral: true 
                    });
                }
                
                case 'toggle': {
                    const enabled = interaction.options.getBoolean('enabled');
                    config.blacklist.enabled = enabled;
                    await client.config.saveVCConfig(guildId, config);
                    return interaction.reply({ 
                        content: `Blacklist has been ${enabled ? 'enabled' : 'disabled'}`,
                        ephemeral: true 
                    });
                }
            }
        } catch (error) {
            console.error('Error in blacklist command:', error);
            return interaction.reply({ 
                content: 'An error occurred while processing your request', 
                ephemeral: true 
            });
        }
    }
};

module.exports = command;
