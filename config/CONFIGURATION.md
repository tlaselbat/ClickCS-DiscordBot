# Bot Configuration Guide

This document explains all available configuration options in `bot-config.json`.

## Table of Contents
- [Bot Settings](#bot-settings)
- [Permissions](#permissions)
- [Roles](#roles)
- [Events](#events)
- [Logging](#logging)
- [Database](#database)

## Bot Settings

| Option      | Type    | Default | Description |
|-------------|---------|---------|-------------|
| prefix      | string  | `!`     | Command prefix for bot commands |
| version     | string  | 1.0.0   | Current version of the bot |
| maxRetries  | number  | 3       | Maximum number of retries for failed operations |
| retryDelay  | number  | 2000    | Delay in milliseconds between retries |

## Permissions

| Option  | Type   | Default               | Description |
|---------|--------|-----------------------|-------------|
| ownerID | string | "1270007253000261633" | Discord user ID of the bot owner |

## Roles

### voiceChannel

| Option      | Type    | Default    | Description |
|-------------|---------|------------|-------------|
| name        | string  | "vc_"    | Role name for users in voice channels |
| color       | string  | "#00ff00"  | Role color in hex format |
| mentionable | boolean | true       | Whether the role can be mentioned |
| enabled     | boolean | true       | Whether voice channel role management is enabled |
| autoRemove  | boolean | true       | Whether to automatically remove role when user leaves voice channel |

## Events

### voiceStateUpdate

| Option         | Type    | Default | Description |
|----------------|---------|---------|-------------|
| enabled        | boolean | true    | Whether to process voice state updates |
| debug          | boolean | true    | Whether to enable debug logging for voice events |
| autoManageRoles| boolean | true    | Whether to automatically manage voice channel roles |

## Logging

| Option | Type   | Default | Description |
|--------|--------|---------|-------------|
| level  | string | "info"  | Minimum log level to display |

### file

| Option   | Type   | Default | Description |
|----------|--------|---------|-------------|
| maxSize  | string | "5MB"   | Maximum size of each log file |
| maxFiles | number | 5       | Maximum number of log files to keep |

## Database

| Option  | Type    | Default           | Description |
|---------|---------|-------------------|-------------|
| enabled | boolean | false            | Whether to use a database |
| type    | string  | "sqlite"         | Database type |
| path    | string  | "./data/bot.db"  | Path to the database file |
