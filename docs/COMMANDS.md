# ClickCS Bot Commands

This document provides a comprehensive list of all available commands in the ClickCS Discord Bot.

## Table of Contents

- [Voice Channel Management](#voice-channel-management)
  - [vc-channel](#vc-channel)
  - [vc-config](#vc-config)
- [Utility Commands](#utility-commands)
  - [ping](#ping)
  - [userinfo](#userinfo)

## Voice Channel Management

### vc-channel
Manage voice channel role assignments.

#### Subcommands:

**add**
- **Description**: Add a role to be assigned when joining a voice channel
- **Usage**: `/vc-channel add channel:<channel> role:<role>`
- **Required Permissions**: Manage Roles
- **Options**:
  - `channel`: The voice channel to configure (required)
  - `role`: The role to assign when joining the voice channel (required)

**remove**
- **Description**: Remove a role assignment from a voice channel
- **Usage**: `/vc-channel remove channel:<channel> role:<role>`
- **Required Permissions**: Manage Roles
- **Options**:
  - `channel`: The voice channel to modify (required)
  - `role`: The role to remove from the channel (required)

**list**
- **Description**: List all voice channel role assignments
- **Usage**: `/vc-channel list`
- **Required Permissions**: Manage Roles

### vc-config
Configure voice channel role management settings.

#### Subcommands:

**enable**
- **Description**: Enable voice channel role management
- **Usage**: `/vc-config enable`
- **Required Permissions**: Manage Roles

**disable**
- **Description**: Disable voice channel role management
- **Usage**: `/vc-config disable`
- **Required Permissions**: Manage Roles

**status**
- **Description**: Show current voice channel role management status
- **Usage**: `/vc-config status`
- **Required Permissions**: View Channel

## Utility Commands

### ping
- **Description**: Check the bot's latency
- **Usage**: `/ping`
- **Required Permissions**: None
- **Response**:
  ```
  🏓 Pong!
  Bot Latency: [latency]ms
  API Latency: [apiLatency]ms
  ```

### userinfo
- **Description**: Get information about a user
- **Usage**: `/userinfo [user] [show_roles]`
- **Required Permissions**: View Channel
- **Options**:
  - `user`: The user to get information about (optional, defaults to command user)
  - `show_roles`: Whether to show all roles (can be long) (optional, boolean)
- **Response**:
  - User information including:
    - Username and discriminator
    - Account creation date
    - Server join date
    - Roles (if show_roles is true)
    - Permissions (if applicable)

## Permission Requirements

- **Manage Roles**: Required for voice channel management commands
- **View Channel**: Required for basic command usage
- **Administrator**: Some commands may require administrator privileges

## Slash Command Usage

All commands are implemented as Discord slash commands. You can use the built-in command picker in Discord by typing `/` followed by the command name.

## Command Cooldowns

- **ping**: No cooldown
- **userinfo**: 5 seconds
- **vc-channel**: 3 seconds
- **vc-config**: 3 seconds

## Troubleshooting

If a command is not working:
1. Check that the bot has the necessary permissions
2. Verify that you have the required permissions to use the command
3. Ensure the command is being used in the correct context (e.g., in a server, not in DMs if not allowed)
4. Check the bot's status to ensure it's online and responding
