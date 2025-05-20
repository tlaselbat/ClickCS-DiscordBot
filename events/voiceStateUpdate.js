const Discord = require("discord.js");
const logger = require('../utils/logger');

/**
 * Handles voice state updates for managing "in vc" role
 * @param {Discord.VoiceState} oldState - The old voice state
 * @param {Discord.VoiceState} newState - The new voice state
 * @param {Discord.Client} client - The Discord client instance
 */
module.exports = async (oldState, newState, client) => {
    try {
        // Validate parameters
        if (!newState || !newState.guild || !newState.member) {
            logger.warn('Invalid voice state update parameters');
            return;
        }

        const guild = newState.guild;
        const member = newState.member;

        // Find the "in vc" role
        const role = guild.roles.cache.find(role => role.name.toLowerCase() === "in vc");
        if (!role) {
            logger.warn(`"in vc" role not found in guild ${guild.id}`);
            return;
        }

        // If user joins a voice channel
        if (newState.channel && !oldState.channel) {
            logger.info(`Adding "in vc" role to ${member.user.tag} in ${guild.name}`);
            await member.roles.add(role);
        }
        // If user leaves a voice channel
        else if (!newState.channel && oldState.channel) {
            logger.info(`Removing "in vc" role from ${member.user.tag} in ${guild.name}`);
            await member.roles.remove(role);
        }
    } catch (error) {
        logger.error('Error in voiceStateUpdate event handler:', error);
        // Don't throw error to prevent event handler from crashing
    }
};
