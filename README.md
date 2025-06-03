# ClickCS Discord Bot

A feature-rich Discord bot for managing voice channel roles and server utilities.

## Features

- Automatic role management for voice channels
- Configurable voice channel roles
- Server utilities and moderation tools
- Customizable presence and status messages

## Commands

### General Commands

- `/ping` - Check if the bot is responsive and measure latency
- `/userinfo [user]` - Get information about a user

### Voice Channel Management

- `/vc-channel` - Manage voice channel role assignments
  - `add <channel> <role>` - Add a role to be assigned when joining a voice channel
  - `remove <channel>` - Remove role assignment from a voice channel
  - `list` - Show all voice channel role assignments
  - `clear` - Remove all voice channel role assignments

- `/vc-config` - Configure voice channel management
  - `enable` - Enable voice channel role management
  - `disable` - Disable voice channel role management
  - `status` - Show current configuration status

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your Discord token
4. Start the bot: `node main.js`

## Configuration

Bot configuration can be modified in the `config` directory:

- `bot-config.json` - Main bot configuration
- `presence-config.json` - Customize bot's presence and status messages
- `guilds/<guild-id>.json` - Per-guild configuration

## Permissions

The bot requires the following permissions:

- `MANAGE_ROLES` - To manage role assignments
- `VIEW_CHANNEL` - To see voice channels
- `CONNECT` - To monitor voice channels
- `SEND_MESSAGES` - To send command responses

## Development

- Source code is in the `src/` directory
- Commands are in `src/commands/`
- Event handlers are in `src/events/`
- Services and utilities are in `src/services/`

## License

[MIT](LICENSE)
