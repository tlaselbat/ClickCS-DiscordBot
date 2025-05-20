/**
 * Discord.js event handler for voice state updates
 * Automatically manages "in vc" role based on user's voice channel status
 *
 * @param {Discord.VoiceState} oldState - The old voice state of the user
 * @param {Discord.VoiceState} newState - The new voice state of the user
 * @param {Discord.Client} client - The Discord client instance
 */
const Discord = require("discord.js");

module.exports = async (oldState, newState, client) => {
	// If user joins a voice channel, add the "in vc" role
	if (newState.channelID) {
		const role = newState.guild.roles.cache.find(role => role.name.toLowerCase() === "in vc");
		return newState.member.roles.add(role);
	}
	// If user leaves a voice channel, remove the "in vc" role
	else {
		const role = newState.guild.roles.cache.find(role => role.name.toLowerCase() === "in vc");
		return newState.member.roles.remove(role);
	}
};

