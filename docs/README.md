# ClickCS Discord Bot

A feature-rich Discord bot for managing voice channels, roles, and more.

## Features

- Voice channel role management
- Slash commands
- Configurable permissions
- Logging and error handling
- Easy deployment

## Prerequisites

- Node.js 18.0.0 or higher
- npm 7.0.0 or higher
- A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/clickcs-discordbot.git
   cd clickcs-discordbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your bot token and other settings:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   NODE_ENV=development
   ```

## Running the Bot

### Development Mode

```bash
npm run dev
```

This will start the bot with nodemon, which automatically restarts when files change.

### Production Mode

```bash
npm start
```

## Project Structure

```
.
├── config/               # Configuration files
│   ├── vc-config/        # Voice channel configuration
│   └── presence-config.json
├── src/
│   ├── commands/         # Slash command handlers
│   ├── events/           # Discord event handlers
│   ├── factories/        # Factory functions
│   ├── handlers/         # Command and event handlers
│   ├── services/         # Business logic services
│   ├── utils/            # Utility functions
│   ├── app.js            # Main application entry point
│   └── index.js          # Legacy entry point
├── .env                  # Environment variables
├── .env.example          # Example environment variables
├── package.json
└── README.md
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|:--------:|:-------:|
| DISCORD_TOKEN | Your Discord bot token | Yes | - |
| CLIENT_ID | Your Discord application client ID | Yes | - |
| NODE_ENV | Application environment (development/production) | No | development |
| PORT | Port for the health check server | No | 3000 |

### Bot Configuration

Bot settings can be configured in `config/bot-config.json`. See the example configuration for available options.

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue on the [GitHub repository](https://github.com/yourusername/clickcs-discordbot/issues).
