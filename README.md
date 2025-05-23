# ClickCS-VCBot

A robust Discord bot for managing voice channels, roles, and server interactions with comprehensive configuration options and error handling.

## ✨ Features

### 🎙️ Voice Channel Management
- Automatic role assignment when users join/leave voice channels
- Configurable channel access permissions
- Per-guild configuration system
- Persistent storage of settings

### ⚙️ Commands

#### VC Access Management
`/vc-access`
- **Description**: Toggle voice channel access permissions
- **Options**:
  - `enable` (boolean, required): Enable or disable VC access
  - `channel` (channel, optional): Channel to grant access to when in VC
- **Permissions Required**: Manage Channels
- **Example**: `/vc-access enable:true channel:#general`

#### VC Role Management
`/vc-role`
- **Description**: Toggle voice channel role assignments
- **Options**:
  - `enable` (boolean, required): Enable or disable VC role assignment
  - `role` (role, optional): Role to assign when in VC
- **Permissions Required**: Manage Roles
- **Example**: `/vc-role enable:true role:@members`

## 🚀 Quick Start

### Prerequisites
- Node.js 16.9.0 or higher
- npm (comes with Node.js)
- Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ClickCS-VCBot.git
   cd ClickCS-VCBot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   ```

## 🛠️ Usage

### Starting the Bot
```bash
npm start
```

### Stopping the Bot
```bash
npm run stop
```

### Checking Status
```bash
npm run status
```

## ⚙️ Configuration

### File Structure
```
config/
  ├── bot-config.json    # General bot settings
  └── <guild-id>.json     # Per-guild configurations
```

### Configuration Options
- **Channel Access**: Control which channels are accessible when users are in voice
- **Role Management**: Automatically assign/remove roles based on voice activity
- **Server-specific Settings**: Each server can have its own configuration

## 🔄 Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the bot |
| `npm stop` | Stop the bot |
| `npm run status` | Check bot status |
| `npm run build` | Rebuild the bot |
| `npm run fix` | Fix common issues |
| `npm run reset` | Reset configuration |
| `npm run squeak` | Special command (see source) |

## 🐛 Error Handling

- Automatic reconnection with exponential backoff
- Detailed error logging with Winston
- Graceful shutdown procedures
- Safe fallbacks for missing configurations

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

ISC © 2023 Lizard and AsianAreAsian
