# ClickCS Discord Bot

A powerful Discord bot designed to manage voice channel roles and provide various utilities for your server.

## ✨ Features

### 🎙️ Voice Channel Management
- **Automatic Role Management**: Automatically assigns/removes roles when users join/leave voice channels
- **Real-time State Tracking**: Uses an advanced caching system to track voice states accurately
- **Configurable Role**: Set any role to be managed via voice channel presence
- **Detailed Logging**: Comprehensive logs for monitoring and debugging
- **Per-guild Configuration**: Customize settings for each server individually

## 🎯 Voice Channel Role Management

### How It Works
1. When a user joins any voice channel, the bot automatically assigns them the configured role
2. When a user leaves all voice channels, the bot removes the role
3. The system handles edge cases like disconnections and server restarts

### Configuration
Edit `config/bot-config.json` to customize the role behavior:

```json
{
  "roles": {
    "voiceChannel": {
      "name": "vc_",  // The role name to manage
      "enabled": true   // Enable/disable the feature
    }
  }
}
```

### Requirements
- The bot needs the `Manage Roles` permission
- The bot's role must be higher in the role hierarchy than the role it's managing
- The role should not be assigned to any other purpose to prevent conflicts

## 🚀 Quick Start

### Prerequisites
- Node.js 16.9.0 or higher
- npm (comes with Node.js)
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

3. Create a `.env` file with your bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   ```

4. Configure your bot in `config/bot-config.json`

5. Start the bot:
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Environment Variables
- `DISCORD_TOKEN`: Your bot token (required)
- `PREFIX`: Command prefix (default: `!`)

### Bot Configuration
Edit `config/bot-config.json` to customize bot behavior:

```json
{
  "roles": {
    "voiceChannel": {
      "name": "vc_",
      "enabled": true
    }
  },
  "presence": {
    "activities": [
      {
        "name": "{prefix}help",
        "type": "LISTENING"
      }
    ],
    "status": "online"
  }
}
```

## 🛠️ Development

### Project Structure
```
├── commands/         # Bot command handlers
├── config/           # Configuration files
├── events/           # Event handlers
│   └── voiceStateUpdate.js  # Voice channel role management
├── utils/            # Utility functions
├── .env              # Environment variables
├── main.js           # Bot entry point
└── package.json      # Project dependencies
```

### Development Setup
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure
3. Run in development mode: `npm run dev`

### Testing
- Run tests: `npm test`
- Lint code: `npm run lint`
- Format code: `npm run format`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📬 Support

For support, please open an issue on GitHub or contact the maintainers.

---

<div align="center">
  Made with ❤️ by ClickCS Team
</div>
