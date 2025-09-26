export type ACMode = 'cool' | 'heat' | 'fan' | 'auto' | 'dry';
export type FanLevel = 'auto' | 'low' | 'medium' | 'high' | 'quiet';
export type SwingMode = 'stopped' | 'fixedTop' | 'fixedMiddleTop' | 'fixedMiddle' | 'fixedMiddleBottom' | 'fixedBottom' | 'rangeTop' | 'rangeMiddle' | 'rangeBottom' | 'rangeFull';
export type TemperatureUnit = 'C' | 'F';

export interface ACState {
  on: boolean;
  mode: ACMode;
  fanLevel: FanLevel;
  targetTemperature: number;
  temperatureUnit: TemperatureUnit;
  swing?: SwingMode;
}

export interface Measurement {
  time: {
    secondsAgo: number;
    time: string;
  };
  temperature: number;
  humidity: number;
}

export interface SensiboConfig {
  apiKey: string;
  deviceId: string;
  apiUrl: string;
  minTemp: number;
  maxTemp: number;
  voiceVolume: number;
  maxRetries: number;
  retryDelay: number;
}

export interface AppConfig extends SensiboConfig {
  logLevel: string;
}

export class ConfigurationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Configuration errors: ${errors.join(', ')}`);
    this.name = 'ConfigurationError';
  }
}