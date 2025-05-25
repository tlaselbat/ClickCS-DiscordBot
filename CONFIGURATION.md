# Configuration Guide

This document explains how to configure your Discord bot.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=your_discord_server_id

# Optional
NODE_ENV=development  # or 'production'
PORT=8080  # Port for the keep-alive server
```

## Presence Configuration

The bot's presence (status and activity) is configured in `config/presence-config.json`.

### Example Configuration:

```json
{
    "status": "online",
    "activities": [
        {
            "name": "on {guilds} servers",
            "type": "WATCHING"
        },
        {
            "name": "with {users} users",
            "type": "PLAYING"
        }
    ],
    "statusMessages": [
        "Serving {guilds} servers with {users} users",
        "Version {version} | Prefix: {prefix}",
        "Type {prefix}help for commands"
    ],
    "updateInterval": 120000,
    "randomizeStatus": true
}
```

### Available Variables:
- `{prefix}` - Bot command prefix
- `{version}` - Bot version
- `{guilds}` - Number of servers the bot is in
- `{users}` - Total number of users across all servers

### Activity Types:
- `PLAYING`
- `STREAMING`
- `LISTENING`
- `WATCHING`
- `COMPETING`

## VC (Voice Channel) Configuration

Per-guild voice channel configurations are stored in the `config` directory as `{guildId}.json`.

### Default Configuration:

```json
{
    "channelAccessEnabled": false,
    "channelId": null,
    "roleAssignmentEnabled": false,
    "roleId": null
}
```

## Configuration Validation

The bot validates its configuration on startup. If there are any issues, it will log them and exit with an error.

### Common Issues:

1. **Missing Environment Variables**:
   - Ensure all required variables are set in `.env`
   - Check for typos in variable names

2. **Invalid Token Format**:
   - The Discord token should be in the format: `[a-zA-Z0-9_-]{23,28}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27}`

3. **Invalid Presence Config**:
   - Check JSON syntax in `presence-config.json`
   - Ensure activity types are valid
   - Make sure required fields are present

## Development vs Production

- In development mode (`NODE_ENV=development`), the bot provides more detailed error messages
- In production mode (`NODE_ENV=production`), the bot runs more efficiently and shows fewer logs
