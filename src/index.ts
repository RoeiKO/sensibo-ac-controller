import dotenv from 'dotenv';
import winston from 'winston';
import { SensiboAPI } from './sensibo-api.js';
import { KeyboardListener } from './keyboard-listener.js';
import { VoiceFeedback } from './voice.js';
import { SensiboConfig } from './types.js';

// Load environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...args }) => {
      return `${timestamp} [${level}]: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'ac-controller.log' }),
  ],
});

class ACController {
  private sensiboAPI: SensiboAPI;
  private keyboardListener: KeyboardListener;
  private voiceFeedback: VoiceFeedback;
  private config: SensiboConfig;
  private maxRetries = 3;
  private retryDelay = 2000;

  constructor() {
    // Validate environment variables
    this.validateEnvironment();

    // Initialize configuration
    this.config = {
      apiKey: process.env.SENSIBO_API_KEY!,
      deviceId: process.env.SENSIBO_DEVICE_ID!,
      apiUrl: process.env.SENSIBO_API_URL || 'https://home.sensibo.com/api/v2',
      minTemp: parseInt(process.env.MIN_TEMP || '16', 10),
      maxTemp: parseInt(process.env.MAX_TEMP || '30', 10),
    };

    // Initialize components
    this.sensiboAPI = new SensiboAPI(this.config, logger);
    this.keyboardListener = new KeyboardListener(logger);
    this.voiceFeedback = new VoiceFeedback(logger);
  }

  private validateEnvironment(): void {
    const required = ['SENSIBO_API_KEY', 'SENSIBO_DEVICE_ID'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      logger.error(`Missing required environment variables: ${missing.join(', ')}`);
      logger.error('Please create a .env file with SENSIBO_API_KEY and SENSIBO_DEVICE_ID');
      process.exit(1);
    }
  }

  private async withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        logger.error(`${operationName} failed (attempt ${attempt}/${this.maxRetries}):`, error);
        
        if (attempt === this.maxRetries) {
          logger.error(`${operationName} failed after ${this.maxRetries} attempts`);
          await this.voiceFeedback.announceError(`${operationName} failed`);
          return null;
        }
        
        logger.info(`Retrying in ${this.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    return null;
  }

  async start(): Promise<void> {
    logger.info('Starting AC Controller...');
    logger.info('Keyboard shortcuts:');
    logger.info('  CTRL + Pause: Toggle AC on/off');
    logger.info('  CTRL + Numpad digits (2 digits): Set temperature');
    logger.info('  ALT + Pause: Voice status announcement');
    logger.info('Press CTRL+C to exit');

    // Test API connection
    const state = await this.withRetry(
      () => this.sensiboAPI.getCurrentState(),
      'Initial API connection'
    );
    
    if (!state) {
      logger.error('Failed to connect to Sensibo API. Please check your configuration.');
      process.exit(1);
    }

    logger.info(`AC is currently ${state.on ? 'ON' : 'OFF'} at ${state.targetTemperature}°C`);

    // Setup keyboard event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Toggle AC power
    this.keyboardListener.on('toggle', async () => {
      logger.info('Toggle command received');
      
      const newState = await this.withRetry(
        () => this.sensiboAPI.togglePower(),
        'Toggle power'
      );
      
      if (newState !== null) {
        const message = `AC turned ${newState ? 'on' : 'off'}`;
        logger.info(message);
        await this.voiceFeedback.announceSuccess(message);
      }
    });

    // Set temperature
    this.keyboardListener.on('setTemperature', async (temperature: number) => {
      logger.info(`Set temperature command received: ${temperature}°C`);
      
      if (temperature < this.config.minTemp || temperature > this.config.maxTemp) {
        const error = `Temperature must be between ${this.config.minTemp} and ${this.config.maxTemp}`;
        logger.error(error);
        await this.voiceFeedback.announceError(error);
        return;
      }

      const success = await this.withRetry(
        async () => {
          await this.sensiboAPI.setTemperature(temperature);
          return true;
        },
        'Set temperature'
      );
      
      if (success) {
        const message = `Temperature set to ${temperature} degrees`;
        logger.info(message);
        await this.voiceFeedback.announceSuccess(message);
      }
    });

    // Voice status
    this.keyboardListener.on('voiceStatus', async () => {
      logger.info('Voice status command received');
      
      try {
        const [state, roomTemp] = await Promise.all([
          this.sensiboAPI.getCurrentState(),
          this.sensiboAPI.getRoomTemperature(),
        ]);
        
        await this.voiceFeedback.announceTemperatures(state.targetTemperature, roomTemp);
      } catch (error) {
        logger.error('Failed to get status:', error);
        await this.voiceFeedback.announceError('Failed to get status');
      }
    });
  }

  stop(): void {
    logger.info('Stopping AC Controller...');
    this.keyboardListener.stop();
    this.voiceFeedback.stop();
    logger.info('AC Controller stopped');
  }
}

// Main execution
const controller = new ACController();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  controller.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  controller.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  controller.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  controller.stop();
  process.exit(1);
});

// Start the controller
controller.start().catch((error) => {
  logger.error('Failed to start controller:', error);
  process.exit(1);
});