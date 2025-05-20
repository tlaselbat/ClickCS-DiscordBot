/**
 * Module for managing voice channel roles in Discord.
 * This module handles automatic role management based on users' voice channel status.
 * It provides functionality to add/remove a specific role when users join/leave voice channels.
 */
const { GuildMember, VoiceState, Client } = require('discord.js');

/**
 * Name of the role to be managed when users join/leave voice channels.
 * This role will be automatically added/removed based on voice channel status.
 * The role name is case-insensitive and will be matched regardless of capitalization.
 */
const ROLE_NAME = 'in vc';

/**
 * Sets up the voice state update event handler for the Discord client.
 * This function configures the Discord client to automatically manage the "in vc" role
 * for users based on their voice channel status.
 *
 * @param {Client} client - The Discord.js client instance to attach the event handler to
 * @throws {Error} Throws an error if the client parameter is not provided or invalid
 */
function setupVoiceStateUpdate(client) {
  /**
   * Event handler for voice state updates.
   * This handler is triggered whenever a user's voice state changes in Discord.
   * It automatically adds/removes the "in vc" role when users join/leave voice channels.
   *
   * @param {VoiceState} oldState - The voice state before the update
   * @param {VoiceState} newState - The voice state after the update
   * @throws {Error} Throws an error if there's an issue updating the user's roles
   */
  client.on('voiceStateUpdate', async (oldState, newState) => {
    // Log the voice state update event with detailed state information
    // This helps with debugging and tracking role management actions
    console.log('[VoiceStateUpdate] Voice state update triggered');
    console.log('[VoiceStateUpdate] Old state:', { channelId: oldState.channelId, guildId: oldState.guild?.id });
    console.log('[VoiceStateUpdate] New state:', { channelId: newState.channelId, guildId: newState.guild?.id });

    // Validate guild role cache access
    // This check ensures we have proper access to the guild's role management system
    if (!newState?.guild?.roles?.cache) {
      console.log('[VoiceStateUpdate] No guild roles cache found, exiting');
      return;
    }

    // Locate the target role in the guild's role cache
    // Uses case-insensitive matching to find the "in vc" role
    const role = newState.guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_NAME.toLowerCase());
    console.log('[VoiceStateUpdate] Found role:', role ? role.name : 'Role not found');

    // Early return if the required role doesn't exist
    // This prevents errors and unnecessary processing if the role is missing
    if (!role) {
      console.log('[VoiceStateUpdate] Role "in vc" not found in guild roles');
      return;
    }

    // Process only when there's an actual voice channel change
    // This prevents unnecessary role updates when users don't change channels
    if (oldState.channelId !== newState.channelId) {
      console.log('[VoiceStateUpdate] Voice channel changed detected');
      try {
        // Determine the appropriate role action based on new channel state
        // If user joins a channel -> add role, if user leaves -> remove role
        const action = newState.channel ? 'add' : 'remove';
        console.log(`[VoiceStateUpdate] Action to perform: ${action} role`);

        // Perform the role update operation
        // Uses Discord.js's role management API to modify the user's roles
        await newState.member.roles[action](role);
        console.log(`[VoiceStateUpdate] Successfully ${action === 'add' ? 'added' : 'removed'} "${ROLE_NAME}" role to ${newState.member.user.tag}`);
      } catch (error) {
        // Log any errors that occur during role update
        // This helps with debugging and tracking issues with role management
        console.error(`[VoiceStateUpdate] Error updating voice state role:`, error);
      }
    }
  });
}

const fs = require('fs');
const path = require('path');

/**
 * Loads and registers all event handlers
 * @param {Client} client - The Discord client instance
 */
module.exports = (client) => {
    const eventFiles = fs.readdirSync(path.join(__dirname, 'events'))
        .filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const event = require(`./events/${file}`);
        const eventName = file.split('.')[0];
        
        if (eventName === 'ready') {
            event(client);
        } else {
            client.on(eventName, (...args) => event(...args, client));
        }
    }
    setupVoiceStateUpdate(client);
};