import { GlobalKeyboardListener, IGlobalKeyEvent } from 'node-global-key-listener';
import winston from 'winston';
import { EventEmitter } from 'events';

export interface KeyboardEvents {
  'toggle': void;
  'setTemperature': number;
  'voiceStatus': void;
}

export class KeyboardListener extends EventEmitter {
  private listener: GlobalKeyboardListener;
  private logger: winston.Logger;
  private ctrlPressed = false;
  private altPressed = false;
  private temperatureBuffer: string[] = [];
  private lastKeyTime = 0;
  
  constructor(logger: winston.Logger) {
    super();
    this.logger = logger;
    this.listener = new GlobalKeyboardListener();
    this.setupListeners();
  }

  private setupListeners(): void {
    this.listener.addListener((event: IGlobalKeyEvent) => {
      const keyName = event.name || event.rawKey?.name || 'UNKNOWN';
      if (event.state === 'DOWN') {
        this.handleKeyDown(keyName);
      } else if (event.state === 'UP') {
        this.handleKeyUp(keyName);
      }
    });
  }

  private handleKeyDown(keyName: string | number): void {
    // Convert to string if it's a number (from IGlobalKey type)
    const key = String(keyName).toUpperCase();
    const currentTime = Date.now();
    
    // Track modifier keys
    if (key === 'LEFT CTRL' || key === 'RIGHT CTRL') {
      this.ctrlPressed = true;
    }
    if (key === 'LEFT ALT' || key === 'RIGHT ALT') {
      this.altPressed = true;
    }

    // CTRL + Pause - Toggle AC (appears as CANCEL when CTRL is pressed)
    if (this.ctrlPressed && !this.altPressed && (key === 'PAUSE' || key === 'CANCEL')) {
      this.logger.info('Toggle AC hotkey detected (CTRL+Pause)');
      this.emit('toggle');
      this.temperatureBuffer = [];
      return;
    }

    // ALT + Pause - Voice status (appears as PAUSE when ALT is pressed)
    if (this.altPressed && !this.ctrlPressed && key === 'PAUSE') {
      this.logger.info('Voice status hotkey detected (ALT+Pause)');
      this.emit('voiceStatus');
      this.temperatureBuffer = [];
      return;
    }

    // CTRL + Numpad digits for temperature
    if (this.ctrlPressed && !this.altPressed) {
      const numpadMatch = key.match(/^NUMPAD (\d)$/);
      if (numpadMatch) {
        const digit = numpadMatch[1];
        
        // Reset buffer if too much time has passed
        if (currentTime - this.lastKeyTime > 1000) {
          this.temperatureBuffer = [];
        }
        
        this.temperatureBuffer.push(digit);
        this.lastKeyTime = currentTime;
        
        this.logger.debug(`Temperature buffer: ${this.temperatureBuffer.join('')}`);
        
        // If we have 2 digits, set the temperature
        if (this.temperatureBuffer.length === 2) {
          const temperature = parseInt(this.temperatureBuffer.join(''), 10);
          this.logger.info(`Set temperature to ${temperature}°C`);
          this.emit('setTemperature', temperature);
          this.temperatureBuffer = [];
        }
      }
    }
  }

  private handleKeyUp(keyName: string | number): void {
    const key = String(keyName).toUpperCase();
    
    // Release modifier keys
    if (key === 'LEFT CTRL' || key === 'RIGHT CTRL') {
      this.ctrlPressed = false;
      // Clear temperature buffer when CTRL is released
      if (this.temperatureBuffer.length > 0) {
        this.logger.debug('CTRL released, clearing temperature buffer');
        this.temperatureBuffer = [];
      }
    }
    if (key === 'LEFT ALT' || key === 'RIGHT ALT') {
      this.altPressed = false;
    }
  }

  stop(): void {
    this.listener.kill();
    this.removeAllListeners();
    this.logger.info('Keyboard listener stopped');
  }
}