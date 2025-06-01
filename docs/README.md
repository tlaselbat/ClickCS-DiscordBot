# ClickCS Discord Bot

A feature-rich Discord bot built with Discord.js v14, designed to enhance your server with voice channel management and utility commands.

## ✨ Features

- 🎙️ **Voice Channel Management**
  - Create and manage voice channels
  - Automatic role assignment in voice channels
  - Custom voice channel configurations

- ⚙️ **Configuration**
  - Per-guild configuration system
  - Easy setup with environment variables
  - Configurable permissions and settings

- 🛡️ **Reliability**
  - Graceful error handling
  - Automatic reconnection
  - Logging system with file rotation

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ClickCS-DiscordBot.git
   cd ClickCS-DiscordBot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your details:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your bot token and configuration:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_bot_client_id
   GUILD_ID=your_guild_id
   NODE_ENV=development
   ```

### Running the Bot

- **Development mode** (with auto-restart):
  ```bash
  npm run dev
  ```

- **Production mode**:
  ```bash
  npm start
  ```

## 🛠️ Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|:--------:|:-------:|
| `DISCORD_TOKEN` | Your bot's token | ✅ | - |
| `CLIENT_ID` | Your bot's client ID | ✅ | - |
| `GUILD_ID` | Your server ID | ✅ | - |
| `NODE_ENV` | Environment (development/production) | ❌ | `development` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | ❌ | `info` |

### Bot Configuration

Configuration files are stored in the `config/` directory:

- `bot-config.json` - General bot settings
- `voice-channel-config.json` - Voice channel settings
- `presence-config.json` - Bot presence configuration

## 🤖 Available Commands

### Voice Channel Commands

- `/vc create [name]` - Create a new voice channel
- `/vc delete [channel]` - Delete a voice channel
- `/vc config` - Configure voice channel settings

### Utility Commands

- `/ping` - Check bot latency
- `/help` - Show help information

## 🛡️ Permissions

The bot requires the following permissions:

- `View Channels`
- `Send Messages`
- `Manage Channels`
- `Connect`
- `Speak`
- `Move Members`
- `Use Voice Activity`

## 📦 Dependencies

- [discord.js](https://discord.js.org/) - Discord API wrapper
- [winston](https://github.com/winstonjs/winston) - Logging
- [joi](https://joi.dev/) - Data validation
- [dotenv](https://github.com/motdotla/dotenv) - Environment variable management

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 Changelog

### 1.0.0
- Initial release with voice channel management
- Basic utility commands
- Configuration system

## 📞 Support

For support, please open an issue on the [GitHub repository](https://github.com/yourusername/ClickCS-DiscordBot/issues).
