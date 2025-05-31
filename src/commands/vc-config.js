const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, GuildMember } = require('discord.js');
const logger = require('../utils/logger');

/**
 * Command to enable/disable voice channel role management
 * @module commands/vc-config
 */

/**
 * @typedef {Object} VCConfig
 * @property {boolean} enabled - Whether voice channel role management is enabled
 * @property {Object.<string, string[]>} [channelRoles] - Mapping of channel IDs to role IDs
 */

/**
 * @typedef {Object} CommandHandler
 * @property {string} guildId - The ID of the guild
 * @property {function((string|Object)): Promise<void>} reply - Function to send a reply
 * @property {Object} [options] - Command options
 * @property {function(): string} [options.getSubcommand] - Gets the subcommand name
 */

// Command data for slash command registration
const data = new SlashCommandBuilder()
    .setName('vc-config')
    .setDescription('Configure voice channel role management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand => subcommand
        .setName('enable')
        .setDescription('Enable voice channel role management'))
    .addSubcommand(subcommand => subcommand
        .setName('disable')
        .setDescription('Disable voice channel role management'))
    .addSubcommand(subcommand => subcommand
        .setName('status')
        .setDescription('Show current voice channel role management status'));

/**
 * Handle the 'enable' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 */
async function handleEnable(handler, config) {
    try {
        if (config.enabled) {
            await handler.reply({
                content: '✅ Voice channel role management is already enabled',
                ephemeral: true
            });
        } else {
            config.enabled = true;
            await handler.reply({
                content: '✅ Voice channel role management has been enabled',
                ephemeral: true
            });
        }
    } catch (error) {
        logger.error('Error in handleEnable:', error);
        throw new Error('Failed to enable voice channel role management');
    }
}

/**
 * Handle the 'disable' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 */
async function handleDisable(handler, config) {
    try {
        if (!config.enabled) {
            await handler.reply({
                content: 'ℹ️ Voice channel role management is already disabled',
                ephemeral: true
            });
        } else {
            config.enabled = false;
            await handler.reply({
                content: '✅ Voice channel role management has been disabled',
                ephemeral: true
            });
        }
    } catch (error) {
        logger.error('Error in handleDisable:', error);
        throw new Error('Failed to disable voice channel role management');
    }
}

/**
 * Handle the 'status' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 */
async function handleStatus(handler, config) {
    try {
        const status = config.enabled ? '✅ Enabled' : '❌ Disabled';
        const channelCount = config.channelRoles ? Object.keys(config.channelRoles).length : 0;
        
        let roleCount = 0;
        if (config.channelRoles) {
            for (const roles of Object.values(config.channelRoles)) {
                roleCount += roles.length;
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Voice Channel Role Management Status')
            .setColor(config.enabled ? 0x00ff00 : 0xff0000)
            .addFields(
                { name: 'Status', value: status, inline: true },
                { name: 'Configured Channels', value: channelCount.toString(), inline: true },
                { name: 'Total Role Assignments', value: roleCount.toString(), inline: true }
            )
            .setTimestamp();
        
        await handler.reply({ 
            embeds: [embed],
            ephemeral: true 
        });
    } catch (error) {
        logger.error('Error in handleStatus:', error);
        throw new Error('Failed to get status of voice channel role management');
    }
}

/**
 * Execute the command
 * @param {import('discord.js').CommandInteraction} interaction - The interaction object
 * @param {import('discord.js').Client} client - Discord client instance
 * @returns {Promise<void>}
 */
async function execute(interaction, client) {
    try {
        // Check permissions
        if (!(interaction.member instanceof GuildMember) || !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ 
                content: '❌ You need the Manage Roles permission to use this command', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        
        if (!guildId) {
            throw new Error('This command can only be used in a server');
        }
        
        const config = await client.config.getVCConfig(guildId);
        const reply = (content) => interaction.reply(typeof content === 'string' ? { content, ephemeral: true } : content);

        // Create handler for slash commands
        const handler = {
            guildId,
            reply,
            options: {
                getSubcommand: () => subcommand
            }
        };

        // Execute the appropriate subcommand
        switch (subcommand) {
            case 'enable':
                await handleEnable(handler, config);
                break;
            case 'disable':
                await handleDisable(handler, config);
                break;
            case 'status':
                await handleStatus(handler, config);
                return; // Status doesn't modify config, no need to save
            default:
                throw new Error('Unknown subcommand');
        }
        
        // Save the updated config
        try {
            logger.debug(`[VC-CONFIG] Saving config for guild ${guildId}`, {
                config,
                guildId,
                configKeys: Object.keys(config || {})
            });
            
            // Verify client.config exists and has the required methods
            if (!client.config || typeof client.config.saveVCConfig !== 'function') {
                const error = new Error('Configuration method not available');
                error.code = 'CONFIG_METHOD_MISSING';
                throw error;
            }
            
            await client.config.saveVCConfig(guildId, config);
            logger.debug(`[VC-CONFIG] Successfully saved config for guild ${guildId}`);
        } catch (saveError) {
            logger.error(`[VC-CONFIG] Failed to save config for guild ${guildId}:`, {
                error: saveError.message,
                stack: saveError.stack,
                code: saveError.code,
                guildId,
                hasSaveMethod: !!(client.config && client.config.saveVCConfig),
                configType: typeof client.config,
                configKeys: client.config ? Object.keys(client.config) : 'no config'
            });
            
            let errorMessage = 'Failed to save configuration. Please try again.';
            
            if (saveError.code === 'ENOENT') {
                errorMessage = 'Configuration directory not found. Please contact an administrator.';
            } else if (saveError.code === 'EACCES' || saveError.code === 'EPERM') {
                errorMessage = 'Permission denied when saving configuration. Please check file permissions.';
            } else if (saveError.code === 'CONFIG_METHOD_MISSING') {
                errorMessage = 'Configuration method not available. The bot may not be properly initialized.';
            } else if (saveError.message.includes('No write access')) {
                errorMessage = 'The bot does not have permission to write to the configuration directory.';
            }
            
            throw new Error(errorMessage);
        }
    } catch (error) {
        logger.error('Error in vc-config command:', {
            error: error.message,
            stack: error.stack,
            guildId: interaction.guildId,
            subcommand: interaction.options?.getSubcommand(),
            userId: interaction.user?.id,
            channelId: interaction.channelId
        });
        
        let errorMessage = error.message || 'An unknown error occurred';
        
        // Provide more user-friendly error messages for common issues
        if (error.message.includes('ENOENT')) {
            errorMessage = 'Configuration error: Could not access the configuration file. Please contact an administrator.';
        } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
            errorMessage = 'Permission denied when trying to save configuration. Please check file permissions.';
        } else if (error.message.includes('ENOSPC')) {
            errorMessage = 'Not enough disk space to save configuration.';
        }
        
        const replyContent = {
            content: `❌ ${errorMessage}`,
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyContent);
            } else {
                await interaction.reply(replyContent);
            }
        } catch (replyError) {
            logger.error('Failed to send error reply:', {
                originalError: error.message,
                replyError: replyError.message
            });
        }
    }
}

// Export the command data and execute function
const command = {
    data,
    execute
};

// Export for backward compatibility
module.exports = command;
module.exports.execute = execute;
