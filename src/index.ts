import dotenv from 'dotenv';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { SensiboAPI } from './sensibo-api.js';
import { KeyboardListener } from './keyboard-listener.js';
import { VoiceFeedback } from './voice.js';
import { AppConfig, ConfigurationError } from './types.js';
import path from 'path';

// Load environment variables
dotenv.config();

// Configure daily rotating file transport
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(process.cwd(), '.logs', 'ac-controller-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m', // Rotate when file reaches 20MB
  maxFiles: '14d', // Keep logs for 14 days
  zippedArchive: true, // Compress rotated files
});

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport with colorized output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...args }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
        })
      )
    }),
    // Daily rotating file transport
    fileRotateTransport
  ],
});

class ACController {
  private sensiboAPI: SensiboAPI;
  private keyboardListener: KeyboardListener;
  private voiceFeedback: VoiceFeedback;
  private config: AppConfig;

  constructor() {
    try {
      // Validate and initialize configuration
      this.config = this.validateEnvironment();
      
      // Initialize components
      this.sensiboAPI = new SensiboAPI(this.config, logger);
      this.keyboardListener = new KeyboardListener(logger);
      this.voiceFeedback = new VoiceFeedback(logger, this.config.voiceVolume);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error('Configuration validation failed:');
        error.errors.forEach(err => logger.error(`  - ${err}`));
        logger.error('Please check your .env file and fix the configuration errors.');
      } else {
        logger.error('Failed to initialize AC Controller:', error);
      }
      process.exit(1);
    }
  }

  private validateEnvironment(): AppConfig {
    const errors: string[] = [];
    
    // Validate required fields
    if (!process.env.SENSIBO_API_KEY) errors.push('SENSIBO_API_KEY is required');
    if (!process.env.SENSIBO_DEVICE_ID) errors.push('SENSIBO_DEVICE_ID is required');
    
    // Validate numeric fields
    const minTemp = parseInt(process.env.MIN_TEMP || '16', 10);
    const maxTemp = parseInt(process.env.MAX_TEMP || '30', 10);
    const voiceVolume = parseInt(process.env.VOICE_VOLUME || '30', 10);
    const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);
    const retryDelay = parseInt(process.env.RETRY_DELAY || '2000', 10);
    
    if (isNaN(minTemp) || minTemp < 10 || minTemp > 35) {
      errors.push('MIN_TEMP must be a number between 10 and 35');
    }
    if (isNaN(maxTemp) || maxTemp < 15 || maxTemp > 40) {
      errors.push('MAX_TEMP must be a number between 15 and 40');
    }
    if (minTemp >= maxTemp) {
      errors.push('MIN_TEMP must be less than MAX_TEMP');
    }
    if (isNaN(voiceVolume) || voiceVolume < 0 || voiceVolume > 100) {
      errors.push('VOICE_VOLUME must be a number between 0 and 100');
    }
    if (isNaN(maxRetries) || maxRetries < 1 || maxRetries > 10) {
      errors.push('MAX_RETRIES must be a number between 1 and 10');
    }
    if (isNaN(retryDelay) || retryDelay < 500 || retryDelay > 30000) {
      errors.push('RETRY_DELAY must be a number between 500 and 30000');
    }
    
    if (errors.length > 0) {
      throw new ConfigurationError(errors);
    }
    
    return {
      apiKey: process.env.SENSIBO_API_KEY!,
      deviceId: process.env.SENSIBO_DEVICE_ID!,
      apiUrl: process.env.SENSIBO_API_URL || 'https://home.sensibo.com/api/v2',
      minTemp,
      maxTemp,
      voiceVolume,
      maxRetries,
      retryDelay,
      logLevel: process.env.LOG_LEVEL || 'info'
    };
  }

  private async withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        logger.error(`${operationName} failed (attempt ${attempt}/${this.config.maxRetries}):`, error);
        
        if (attempt === this.config.maxRetries) {
          logger.error(`${operationName} failed after ${this.config.maxRetries} attempts`);
          await this.voiceFeedback.announceError(`${operationName} failed`);
          return null;
        }
        
        // Exponential backoff with jitter (base delay * 2^(attempt-1) + random jitter)
        const backoffDelay = Math.min(
          this.config.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          10000 // Max 10 seconds
        );
        
        logger.info(`Retrying in ${Math.round(backoffDelay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
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
      
      const statusResult = await this.withRetry(
        async () => {
          const [state, roomTemp] = await Promise.all([
            this.sensiboAPI.getCurrentState(),
            this.sensiboAPI.getRoomTemperature(),
          ]);
          return { state, roomTemp };
        },
        'Get status'
      );
      
      if (statusResult) {
        await this.voiceFeedback.announceTemperatures(
          statusResult.state.targetTemperature, 
          statusResult.roomTemp
        );
      }
    });
  }

  async stop(): Promise<void> {
    logger.info('Stopping AC Controller...');
    
    // Stop components gracefully with timeout
    try {
      this.keyboardListener.stop();
      this.voiceFeedback.stop();
      
      // Wait briefly for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.info('AC Controller stopped');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

// Main execution
const controller = new ACController();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  try {
    await controller.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  try {
    await controller.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception:', error);
  try {
    await controller.stop();
  } catch {
    // Ignore cleanup errors during crash
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  try {
    await controller.stop();
  } catch {
    // Ignore cleanup errors during crash
  }
  process.exit(1);
});

// Start the controller
controller.start().catch((error) => {
  logger.error('Failed to start controller:', error);
  process.exit(1);
});