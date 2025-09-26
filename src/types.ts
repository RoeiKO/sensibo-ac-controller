export interface ACState {
  on: boolean;
  mode: 'cool' | 'heat' | 'fan' | 'auto' | 'dry';
  fanLevel: string;
  targetTemperature: number;
  temperatureUnit: 'C' | 'F';
  swing?: string;
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
}