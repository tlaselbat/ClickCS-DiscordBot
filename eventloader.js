const { GuildMember, VoiceState, Client } = require('discord.js');

const ROLE_NAME = 'in vc';

/**
 * Sets up the voice state update handler for the client
 * @param {Client} client - The Discord.js client instance
 */
function setupVoiceStateUpdate(client) {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    console.log('[VoiceStateUpdate] Voice state update triggered');
    console.log('[VoiceStateUpdate] Old state:', { channelId: oldState.channelId, guildId: oldState.guild?.id });
    console.log('[VoiceStateUpdate] New state:', { channelId: newState.channelId, guildId: newState.guild?.id });

    if (!newState?.guild?.roles?.cache) {
      console.log('[VoiceStateUpdate] No guild roles cache found, exiting');
      return;
    }

    const role = newState.guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_NAME.toLowerCase());
    console.log('[VoiceStateUpdate] Found role:', role ? role.name : 'Role not found');

    if (!role) {
      console.log('[VoiceStateUpdate] Role "in vc" not found in guild roles');
      return;
    }

    if (oldState.channelId !== newState.channelId) {
      console.log('[VoiceStateUpdate] Voice channel changed detected');
      try {
        const action = newState.channel ? 'add' : 'remove';
        console.log(`[VoiceStateUpdate] Action to perform: ${action} role`);
        await newState.member.roles[action](role);
        console.log(`[VoiceStateUpdate] Successfully ${action === 'add' ? 'added' : 'removed'} "${ROLE_NAME}" role to ${newState.member.user.tag}`);
      } catch (error) {
        console.error(`[VoiceStateUpdate] Error updating voice state role:`, error);
      }
    }
  });
}

module.exports = setupVoiceStateUpdate;