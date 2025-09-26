import { GlobalKeyboardListener } from 'node-global-key-listener';
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
    this.listener.addListener((e: any) => {
      if (e.state === 'DOWN') {
        this.handleKeyDown(e.name);
      } else if (e.state === 'UP') {
        this.handleKeyUp(e.name);
      }
    });
  }

  private handleKeyDown(keyName: string): void {
    const currentTime = Date.now();
    
    // Track modifier keys
    if (keyName === 'LEFT CTRL' || keyName === 'RIGHT CTRL') {
      this.ctrlPressed = true;
    }
    if (keyName === 'LEFT ALT' || keyName === 'RIGHT ALT') {
      this.altPressed = true;
    }

    // CTRL + Pause - Toggle AC
    if (this.ctrlPressed && !this.altPressed && keyName === 'PAUSE') {
      this.logger.info('Toggle AC hotkey detected');
      this.emit('toggle');
      this.temperatureBuffer = [];
      return;
    }

    // ALT + Pause - Voice status
    if (this.altPressed && !this.ctrlPressed && keyName === 'PAUSE') {
      this.logger.info('Voice status hotkey detected');
      this.emit('voiceStatus');
      this.temperatureBuffer = [];
      return;
    }

    // CTRL + Numpad digits for temperature
    if (this.ctrlPressed && !this.altPressed) {
      const numpadMatch = keyName.match(/^NUMPAD (\d)$/);
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

  private handleKeyUp(keyName: string): void {
    // Release modifier keys
    if (keyName === 'LEFT CTRL' || keyName === 'RIGHT CTRL') {
      this.ctrlPressed = false;
      // Clear temperature buffer when CTRL is released
      if (this.temperatureBuffer.length > 0) {
        this.logger.debug('CTRL released, clearing temperature buffer');
        this.temperatureBuffer = [];
      }
    }
    if (keyName === 'LEFT ALT' || keyName === 'RIGHT ALT') {
      this.altPressed = false;
    }
  }

  stop(): void {
    this.listener.kill();
    this.removeAllListeners();
    this.logger.info('Keyboard listener stopped');
  }
}