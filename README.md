# ClickCS VC Bot

A Discord bot that manages voice channel access and role assignments automatically.

## Features

- Automatically manages "in vc" roles when users join/leave voice channels
- Configurable channel access permissions
- Role assignment based on voice channel presence
- Persistent configuration storage
- Error handling and logging

## Setup

1. Install dependencies:
```bash
npm install discord.js
```

2. Create a configuration directory:
```bash
mkdir config
```

3. Create an `auth.json` file with your Discord bot token:
```json
{
    "token": "your-discord-bot-token-here"
}
```

## Configuration

The bot uses a configuration system that stores settings per guild. You can configure:

- Channel access permissions
- Role assignments
- Default behaviors

Configuration files are stored in the `config` directory with the format `<guild-id>.json`.

## Usage

1. Run the bot:
```bash
node main.js
```

2. The bot will automatically:
   - Join your Discord server
   - Start managing voice channel events
   - Create default configurations for new guilds

## Error Handling

The bot includes comprehensive error handling:

- Graceful handling of configuration file operations
- Automatic creation of missing configurations
- Detailed error logging
- Safe fallbacks for missing or invalid configurations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
