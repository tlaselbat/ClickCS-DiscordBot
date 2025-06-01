//TODO  modify the vc-channel command and vc-config to allow multiple roles to be assigned 1 channel



/**
 * Command to manage voice channel role assignments
 * @module commands/vc-channel
 */

const { PermissionFlagsBits, SlashCommandBuilder, ChannelType, GuildMember, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

/**
 * @typedef {Object} VCConfig
 * @property {Object.<string, string>} channelRoles - Mapping of channel IDs to role IDs
 */

/**
 * @typedef {Object} CommandHandler
 * @property {string} guildId - The ID of the guild
 * @property {function((string|EmbedBuilder)): Promise<void>} reply - Function to send a reply
 * @property {Object} [options] - Command options
 * @property {function(): {id: string}} [options.getChannel] - Gets the channel
 * @property {function(): {id: string}} [options.getRole] - Gets the role
 */

// Command data for slash command registration
const data = new SlashCommandBuilder()
    .setName('vc-channel')
    .setDescription('Manage voice channel role assignments')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    
    .addSubcommand(subcommand => subcommand
        .setName('add')
        .setDescription('Add a role to be assigned when joining a voice channel')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('The voice channel to configure')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true))
        .addRoleOption(option => option
            .setName('role')
            .setDescription('The role to assign when joining the voice channel')
            .setRequired(true)))
            
    .addSubcommand(subcommand => subcommand
        .setName('remove')
        .setDescription('Remove a role assignment from a voice channel')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('The voice channel to modify')
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true))
        .addRoleOption(option => option
            .setName('role')
            .setDescription('The role to remove from the voice channel')
            .setRequired(true)))
            
    .addSubcommand(subcommand => subcommand
        .setName('list')
        .setDescription('List all voice channel role assignments'))
    .addSubcommand(subcommand => subcommand
        .setName('help')
        .setDescription('Show help information for the vc-channel command'));

/**
 * Handle message-based command
 * @param {Message} message - The message object
 * @param {import('discord.js').Client} client - Discord client instance
 * @returns {Promise<void>}
 */
async function handleMessageCommand(message, client) {
    try {
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw new Error('You need the Manage Roles permission to use this command');
        }

        const args = message.content.split(/\s+/);
        const subcommand = args[1]?.toLowerCase();
        const guildId = message.guildId;
        const config = await client.config.getVCConfig(guildId);

        // Helper function for sending replies
        /**
         * @param {string|EmbedBuilder} content - The content to reply with
         * @returns {Promise<Message>}
         */
        const reply = (content) => 
            message.reply({ content, allowedMentions: { repliedUser: false } });

        // Command handlers
        const commandHandlers = {
            /**
             * @param {string} channelId - The channel ID
             * @param {string} roleId - The role ID
             * @returns {Promise<void>}
             */
            add: async (channelId, roleId) => {
                await handleAdd({ 
                    guildId,
                    reply,
                    options: {
                        getChannel: () => ({ id: channelId }),
                        getRole: () => ({ id: roleId })
                    }
                }, config);
            },
            /**
             * @param {string} channelId - The channel ID
             * @param {string} roleId - The role ID
             * @returns {Promise<void>}
             */
            remove: async (channelId, roleId) => {
                await handleRemove({ 
                    guildId,
                    reply,
                    options: {
                        getChannel: () => ({ id: channelId }),
                        getRole: () => ({ id: roleId })
                    }
                }, config);
            },
            list: async () => {
                await handleList({ 
                    guildId,
                    reply
                }, config);
            },
            help: async () => {
                const helpEmbed = new EmbedBuilder()
                    .setTitle('Voice Channel Role Manager')
                    .setDescription('Manage voice channel role assignments')
                    .addFields(
                        { name: 'Add Role to Channel', value: '`!vc-channel add channel:#channel role:@role`', inline: false },
                        { name: 'Remove Role from Channel', value: '`!vc-channel remove channel:#channel role:@role`', inline: false },
                        { name: 'List All Assignments', value: '`!vc-channel list`', inline: false }
                    )
                    .setColor('#3498db');
                
                await reply(helpEmbed);
            }
        };

        // Execute command
        if (subcommand && typeof commandHandlers[subcommand] === 'function') {
            const channelMatch = message.content.match(/channel:<#(\d+)>/);
            const roleMatch = message.content.match(/role:<@&(\d+)>/);

            if (subcommand === 'list' || subcommand === 'help') {
                await commandHandlers[subcommand]();
            } else if (channelMatch && roleMatch) {
                await commandHandlers[subcommand](channelMatch[1], roleMatch[1]);
            } else {
                throw new Error(`Please specify both channel and role in the format: !vc-channel ${subcommand} channel:#channel role:@role`);
            }
        } else {
            await commandHandlers.help();
        }

        // Save configuration
        await client.config.saveVCConfig(guildId, config);
    } catch (error) {
        logger.error('Error in vc-channel message command:', error);
        await message.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
}

/**
 * Handle the 'add' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 * @returns {Promise<void>}
 */
/**
 * Handle the 'add' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 * @returns {Promise<void>}
 */
async function handleAdd(handler, config) {
    try {
        logger.debug('[VC-CHANNEL] Starting handleAdd', { 
            configKeys: Object.keys(config || {}),
            hasChannelRoles: !!config.channelRoles,
            channelRolesType: typeof config.channelRoles
        });

        const channel = handler.options?.getChannel();
        const role = handler.options?.getRole();
        
        if (!channel || !role) {
            throw new Error('Please specify both a valid voice channel and role.');
        }

        const channelId = channel.id;
        const roleId = role.id;
        
        logger.debug('[VC-CHANNEL] Processing add request', {
            channelId,
            roleId,
            hasChannelRoles: !!config.channelRoles,
            existingRole: config.channelRoles?.[channelId]
        });

        // Initialize channelRoles if it doesn't exist
        if (!config.channelRoles) {
            config.channelRoles = {};
            logger.debug('[VC-CHANNEL] Initialized empty channelRoles object');
        }

        // Check if the channel already has a role
        if (config.channelRoles[channelId]) {
            try {
                const existingRole = await handler.reply.guild.roles.fetch(config.channelRoles[channelId]);
                throw new Error(`This channel already has a role assigned (${existingRole || config.channelRoles[channelId]}). Remove it first.`);
            } catch (fetchError) {
                logger.error('[VC-CHANNEL] Failed to fetch existing role', { 
                    error: fetchError.message,
                    stack: fetchError.stack,
                    roleId: config.channelRoles[channelId]
                });
                throw new Error(`This channel already has a role assigned (ID: ${config.channelRoles[channelId]}). Remove it first.`);
            }
        }
    
        // Add the role to the channel
        config.channelRoles[channelId] = roleId;
        
        logger.debug('[VC-CHANNEL] Successfully added role to channel', {
            channelId,
            roleId,
            channelRoles: Object.keys(config.channelRoles || {})
        });
    
        await handler.reply(`✅ Successfully added role <@&${roleId}> to <#${channelId}>`);
    } catch (error) {
        logger.error('[VC-CHANNEL] Error in handleAdd', { 
            error: error.message,
            stack: error.stack,
            config: JSON.stringify(config, null, 2)
        });
        
        let errorMessage = error.message;
        if (!errorMessage.startsWith('❌')) {
            errorMessage = `❌ ${errorMessage}`;
        }
        
        await handler.reply(errorMessage);
    }
}

/**
 * Handle the 'remove' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 * @returns {Promise<void>}
 */
/**
 * Handle the 'remove' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 * @returns {Promise<void>}
 */
async function handleRemove(handler, config) {
    try {
        logger.debug('[VC-CHANNEL] Starting handleRemove', { 
            configKeys: Object.keys(config || {}),
            hasChannelRoles: !!config.channelRoles,
            channelRolesType: typeof config.channelRoles
        });

        const channel = handler.options?.getChannel();
        const role = handler.options?.getRole();
        
        if (!channel || !role) {
            throw new Error('Please specify both a valid voice channel and role.');
        }

        const channelId = channel.id;
        const roleId = role.id;
        
        logger.debug('[VC-CHANNEL] Processing remove request', {
            channelId,
            roleId,
            hasChannelRoles: !!config.channelRoles,
            existingRole: config.channelRoles?.[channelId]
        });

        if (!config.channelRoles || !config.channelRoles[channelId]) {
            throw new Error('No role is assigned to this channel.');
        }

        // Verify the role matches
        if (config.channelRoles[channelId] !== roleId) {
            try {
                const existingRole = await handler.reply.guild.roles.fetch(config.channelRoles[channelId]);
                throw new Error(`This channel has a different role assigned (${existingRole || config.channelRoles[channelId]}).`);
            } catch (fetchError) {
                logger.error('[VC-CHANNEL] Failed to fetch existing role', { 
                    error: fetchError.message,
                    stack: fetchError.stack,
                    roleId: config.channelRoles[channelId]
                });
                throw new Error(`This channel has a different role assigned (ID: ${config.channelRoles[channelId]}).`);
            }
        }

        // Remove the role from the channel
        delete config.channelRoles[channelId];
        
        logger.debug('[VC-CHANNEL] Successfully removed role from channel', {
            channelId,
            roleId,
            channelRoles: Object.keys(config.channelRoles || {})
        });
    
        await handler.reply(`✅ Successfully removed role <@&${roleId}> from <#${channelId}>`);
    } catch (error) {
        logger.error('[VC-CHANNEL] Error in handleRemove', { 
            error: error.message,
            stack: error.stack,
            config: JSON.stringify(config, null, 2)
        });
        
        let errorMessage = error.message;
        if (!errorMessage.startsWith('❌')) {
            errorMessage = `❌ ${errorMessage}`;
        }
        
        await handler.reply(errorMessage);
    }
}

/**
 * Handle the 'list' subcommand
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 * @returns {Promise<void>}
 */
/**
 * Handle the list command
 * @param {CommandHandler} handler - Command handler object
 * @param {VCConfig} config - Voice channel configuration
 * @returns {Promise<void>}
 */
async function handleList(handler, config) {
    try {
        console.log('[VC-CHANNEL] handleList called with config:', JSON.stringify(config, null, 2));
        
        // Ensure config and channelRoles exist
        if (!config) {
            console.error('[VC-CHANNEL] No config provided to handleList');
            throw new Error('Configuration not loaded. Please try again or contact an administrator.');
        }
        
        if (!config.channelRoles || Object.keys(config.channelRoles).length === 0) {
            console.log('[VC-CHANNEL] No channel roles found in config');
            // Instead of throwing an error, show a helpful message
            return handler.reply(
                'No voice channel role assignments have been set up yet.\n' +
                'Use `/vc add @Role #Channel` to create an assignment.'
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('Voice Channel Role Assignments')
            .setColor('#3498db')
            .setDescription('Here are the current voice channel role assignments:');

        // Get the guild from either the interaction or client
        let guild;
        try {
            if (handler.guildId) {
                guild = await handler.client?.guilds.fetch(handler.guildId);
                console.log(`[VC-CHANNEL] Fetched guild: ${guild?.name} (${guild?.id})`);
            }
        } catch (guildError) {
            console.error('[VC-CHANNEL] Error fetching guild:', guildError);
            return handler.reply('Failed to fetch server information. Please try again.');
        }
        
        if (!guild) {
            throw new Error('Could not determine the guild. Please try again in a server channel.');
        }

        // Fetch all channels and roles to display their names
        const channelIds = Object.keys(config.channelRoles);
        const channelPromises = channelIds.map(id => guild.channels.fetch(id).catch(() => null));
        const channels = await Promise.all(channelPromises);

        const roleIds = Object.values(config.channelRoles);
        const rolePromises = roleIds.map(id => guild.roles.fetch(id).catch(() => null));
        const roles = await Promise.all(rolePromises);

        // Create field for each channel-role pair
        channels.forEach((channel, index) => {
            if (channel && roles[index]) {
                embed.addFields({
                    name: channel.name,
                    value: `@${roles[index].name}`,
                    inline: true
                });
            }
        });

        await handler.reply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleList:', error);
        await handler.reply(`❌ ${error.message}`);
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
        // Check if configuration is properly initialized
        if (!client.config) {
            console.error('[VC-CHANNEL] Client config is missing');
            return interaction.reply({
                content: '❌ Configuration system is not available. Please contact an administrator.',
                ephemeral: true
            });
        }
        
        if (typeof client.config.getVCConfig !== 'function') {
            console.error('[VC-CHANNEL] getVCConfig method is missing from client.config');
            return interaction.reply({
                content: '❌ Configuration system is not properly initialized. Please contact an administrator.',
                ephemeral: true
            });
        }

        // Check permissions
        if (!(interaction.member instanceof GuildMember) || !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ 
                content: '❌ You need the Manage Roles permission to use this command', 
                ephemeral: true 
            });
        }

        // Check if this is a message-based command
        if (interaction.isMessage?.()) {
            return handleMessageCommand(interaction, client);
        }

        const subcommand = interaction.options?.getSubcommand(true);
        const guildId = interaction.guildId;
        
        if (!guildId) {
            throw new Error('This command can only be used in a server.');
        }
        
        const config = await client.config.getVCConfig(guildId);
        const reply = (content) => interaction.reply(typeof content === 'string' ? { content, ephemeral: true } : content);

        // Create handler for slash commands
        const handler = {
            guildId,
            client,  // Pass the client to the handler
            reply,
            options: {
                getChannel: () => interaction.options.getChannel('channel'),
                getRole: () => interaction.options.getRole('role')
            }
        };

        // Execute the appropriate subcommand
        switch (subcommand) {
            case 'add':
                await handleAdd(handler, config);
                break;
            case 'remove':
                await handleRemove(handler, config);
                break;
            case 'list':
                await handleList(handler, config);
                return; // List doesn't modify config, no need to save
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('Voice Channel Role Manager')
                    .setDescription('Manage voice channel role assignments')
                    .addFields(
                        { name: 'Add Role to Channel', value: '`/vc-channel add channel:#channel role:@role`', inline: false },
                        { name: 'Remove Role from Channel', value: '`/vc-channel remove channel:#channel role:@role`', inline: false },
                        { name: 'List All Assignments', value: '`/vc-channel list`', inline: false }
                    )
                    .setColor('#3498db');
                await reply({ embeds: [helpEmbed] });
                return; // Help doesn't modify config, no need to save
            default:
                throw new Error('Unknown subcommand');
        }
        
        // Save the updated config
        try {
            logger.debug(`[VC-CHANNEL] Saving config for guild ${guildId}`, {
                config: config,
                guildId: guildId,
                configKeys: Object.keys(config || {})
            });
            
            // Verify client.config exists and has the required methods
            if (!client.config || typeof client.config.saveVCConfig !== 'function') {
                logger.error(`[VC-CHANNEL] Client config is missing or invalid:`, {
                    hasConfig: !!client.config,
                    configType: typeof client.config,
                    hasSaveMethod: !!(client.config && client.config.saveVCConfig),
                    configKeys: client.config ? Object.keys(client.config) : 'no config',
                    clientConfig: JSON.stringify(client.config, null, 2)
                });
                throw new Error('Configuration system not properly initialized');
            }
            
            // Try to save the config
            logger.debug(`[VC-CHANNEL] Calling saveVCConfig for guild ${guildId}`);
            await client.config.saveVCConfig(guildId, config);
            logger.info(`[VC-CHANNEL] Successfully saved config for guild ${guildId}`);
            
        } catch (saveError) {
            logger.error(`[VC-CHANNEL] Failed to save config for guild ${guildId}:`, {
                error: saveError.message,
                stack: saveError.stack,
                code: saveError.code,
                guildId: guildId,
                hasConfig: !!client.config,
                configType: typeof client.config,
                hasSaveMethod: !!(client.config && client.config.saveVCConfig)
            });
            
            // Log the full client object (without circular references)
            const getCircularReplacer = () => {
                const seen = new WeakSet();
                return (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) return '[Circular]';
                        seen.add(value);
                    }
                    return value;
                };
            };
            
            logger.error(`[VC-CHANNEL] Client state:`, {
                clientKeys: Object.keys(client),
                configKeys: client.config ? Object.keys(client.config) : 'no config',
                configMethods: client.config ? Object.getOwnPropertyNames(Object.getPrototypeOf(client.config)) : 'no config',
                clientConfig: JSON.stringify(client.config, getCircularReplacer(), 2)
            });
            
            let errorMessage = 'Failed to save configuration. Please try again.';
            
            if (saveError.code === 'ENOENT') {
                errorMessage = 'Configuration directory not found. Please contact an administrator.';
            } else if (saveError.code === 'EACCES' || saveError.code === 'EPERM') {
                errorMessage = 'Permission denied when saving configuration. Please check file permissions.';
            } else if (saveError.message.includes('No write access')) {
                errorMessage = 'The bot does not have permission to write to the configuration directory.';
            } else if (saveError.message.includes('not properly initialized')) {
                errorMessage = 'Configuration system is not properly initialized. Please restart the bot.';
            }
            
            throw new Error(errorMessage);
        }
    } catch (error) {
        logger.error('Error in vc-channel command:', {
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
        } else if (error.message.includes('saveVCConfig')) {
            errorMessage = 'Failed to save configuration. The bot may not have the necessary permissions.';
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
module.exports = {
    data,
    execute,
    // Message command support (legacy)
    messageCommand: {
        name: 'vc-channel',
        description: 'Manage voice channel role assignments',
        usage: '!vc-channel <add/remove/list> [options]',
        aliases: ['vcc'],
        category: 'Moderation',
        guildOnly: true,
        permissions: ['ManageRoles'],
        execute: handleMessageCommand
    }
};
