# AC Controller

Control your Sensibo AC with keyboard shortcuts on Windows. This TypeScript application allows you to toggle your AC, set temperature, and get voice feedback about the current state.

## Features

- **Toggle AC Power**: `CTRL + Pause` - Turn AC on/off
- **Set Temperature**: `CTRL + Numpad digits` - Press two numpad digits while holding CTRL (e.g., CTRL + 2 + 5 for 25°C)
- **Voice Status**: `ALT + Pause` - Hear the current target and room temperature via text-to-speech
- **Automatic Retry**: Failed API calls are retried up to 3 times
- **Logging**: All actions are logged to console and file

## Prerequisites

- Windows OS (for keyboard hooks and voice feedback)
- Node.js 16 or higher
- Sensibo device with API access
- Sensibo API key and device ID

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd ac-controller
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file by copying the example:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your Sensibo credentials:
```env
SENSIBO_API_KEY=your_api_key_here
SENSIBO_DEVICE_ID=your_device_id_here
MIN_TEMP=16
MAX_TEMP=30
VOICE_VOLUME=30
LOG_LEVEL=info
```

### Getting Sensibo API Credentials

1. **Get API Key**:
   - Log in to [Sensibo web app](https://home.sensibo.com)
   - Go to Menu → API
   - Generate a new API key

2. **Get Device ID**:
   - Use the API key to call: `https://home.sensibo.com/api/v2/users/me/pods?apiKey=YOUR_API_KEY`
   - Find your device in the response and copy its `id` field

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
1. Build the TypeScript code:
```bash
npm run build
```

2. Run the compiled JavaScript:
```bash
npm start
```

### Running at Startup

1. Create `start-ac-controller.bat`:
```batch
@echo off
cd /d "C:\path\to\ac-controller"
npm start
```

2. Press `Win + R`, type `shell:startup`, and copy the batch file there

## Keyboard Shortcuts

| Shortcut | Action | Example |
|----------|--------|---------|
| `CTRL + Pause` | Toggle AC on/off | Press and release |
| `CTRL + 2 + 5` | Set temperature to 25°C | Hold CTRL, press 2, then 5 on numpad |
| `CTRL + 1 + 8` | Set temperature to 18°C | Hold CTRL, press 1, then 8 on numpad |
| `ALT + Pause` | Voice status announcement | Press and release |
| `CTRL + ALT + 1` | Power on | Press and release |
| `CTRL + ALT + 0` | Power off | Press and release |

## Configuration

Edit the `.env` file to customize:

- `MIN_TEMP`: Minimum allowed temperature (default: 16°C)
- `MAX_TEMP`: Maximum allowed temperature (default: 30°C)
- `VOICE_VOLUME`: Voice feedback volume level 0-100 (default: 30 for low volume)
- `LOG_LEVEL`: Logging verbosity (`debug`, `info`, `warn`, `error`)
- `SENSIBO_API_URL`: Custom API endpoint (optional)

## Troubleshooting

### Keyboard shortcuts not working
- Make sure the application is running with appropriate permissions
- Check if another application is capturing the same keyboard shortcuts
- Try running as administrator if needed

### Voice feedback not working
- Windows SAPI (Speech API) must be installed
- Check Windows sound settings
- Ensure speakers/headphones are connected
- Adjust `VOICE_VOLUME` in `.env` file (0-100 scale, default: 30)
- Set `VOICE_VOLUME=0` to mute voice feedback completely
- Set `VOICE_VOLUME=100` for maximum volume (not recommended)

### API connection errors
- Verify your API key and device ID are correct
- Check internet connection
- Look at the logs in `./logs/ac-controller.log` for detailed error messages

## Project Structure

```
ac-controller/
├── src/
│   ├── index.ts           # Main application entry point
│   ├── sensibo-api.ts     # Sensibo API wrapper
│   ├── keyboard-listener.ts # Global keyboard hook handler
│   ├── voice.ts           # Text-to-speech feedback
│   └── types.ts           # TypeScript type definitions
├── scripts/
│   └── install-startup.ps1 # Windows startup installation script
├── .env                   # Environment configuration (create from .env.example)
├── .env.example          # Example environment file
├── tsconfig.json         # TypeScript configuration
├── package.json          # Node.js dependencies
└── README.md            # This file
```

## Development

### Type Checking
```bash
npm run typecheck
```

### Adding New Shortcuts

Edit `src/keyboard-listener.ts` to add new keyboard combinations. The listener uses `node-global-key-listener` which supports all standard keyboard keys.

### API Methods

The `SensiboAPI` class provides:
- `getCurrentState()` - Get current AC state
- `setACState(state)` - Set AC parameters
- `togglePower()` - Toggle AC on/off
- `setTemperature(temp)` - Set target temperature
- `getRoomTemperature()` - Get current room temperature

## License

MIT