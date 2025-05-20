module.exports = async client => {
	// Log client status
	console.log(`Online in ${client.guilds.cache.size} servers`);
	console.log('Client is ready.');

	// Set client activity
	try {
		await client.user.setActivity('you deafen so I can add you to my hitlist', { type: 'WATCHING' });
	} catch (error) {
		console.error('Failed to set activity:', error);
	}
};