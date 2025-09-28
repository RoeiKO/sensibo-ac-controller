import axios, { AxiosInstance } from 'axios';
import { ACState, Measurement, SensiboConfig } from './types.js';
import winston from 'winston';

export class SensiboAPI {
  private client: AxiosInstance;
  private logger: winston.Logger;
  
  constructor(private config: SensiboConfig, logger: winston.Logger) {
    this.logger = logger;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 5000,
      headers: {
        'Accept-Encoding': 'gzip, deflate',
      },
      params: {
        apiKey: config.apiKey,
      },
    });
  }

  async getCurrentState(): Promise<ACState> {
    try {
      const response = await this.client.get(`/pods/${this.config.deviceId}/acStates`, {
        params: {
          limit: 1,
          apiKey: this.config.apiKey,
        },
      });
      
      const currentState = response.data.result[0];
      this.logger.debug('Current AC state retrieved', currentState);
      return currentState.acState;
    } catch (error) {
      this.logger.error('Failed to get current state:', error);
      throw new Error(`Failed to get AC state: ${error}`);
    }
  }

  async setACState(state: Partial<ACState>, currentState?: ACState): Promise<void> {
    try {
      // Use provided current state to avoid redundant API call
      const baseState = currentState || await this.getCurrentState();
      const newState = { ...baseState, ...state };
      
      const response = await this.client.post(
        `/pods/${this.config.deviceId}/acStates`,
        {
          acState: newState,
        }
      );
      
      if (response.data.status === 'success') {
        this.logger.info('AC state updated successfully', newState);
      } else {
        throw new Error(`API returned status: ${response.data.status}`);
      }
    } catch (error) {
      this.logger.error('Failed to set AC state:', error);
      throw new Error(`Failed to set AC state: ${error}`);
    }
  }

  async setTemperature(temperature: number): Promise<void> {
    if (temperature < this.config.minTemp || temperature > this.config.maxTemp) {
      throw new Error(`Temperature must be between ${this.config.minTemp} and ${this.config.maxTemp}`);
    }
    
    try {
      await this.setACState({ targetTemperature: temperature });
      this.logger.info(`Temperature set to: ${temperature}°C`);
    } catch (error) {
      this.logger.error('Failed to set temperature:', error);
      throw new Error(`Failed to set temperature: ${error}`);
    }
  }

  async getRoomTemperature(): Promise<number> {
    try {
      const response = await this.client.get(`/pods/${this.config.deviceId}/measurements`, {
        params: {
          apiKey: this.config.apiKey,
          fields: '*',
        },
      });

      const measurements: Measurement[] = response.data.result;
      if (measurements.length > 0) {
        const currentTemp = measurements[0].temperature;
        this.logger.info(`Current room temperature: ${currentTemp}°C`);
        return currentTemp;
      }

      throw new Error('No temperature measurements available');
    } catch (error) {
      this.logger.error('Failed to get room temperature:', error);
      throw new Error(`Failed to get room temperature: ${error}`);
    }
  }

  async syncPowerState(actualState: boolean): Promise<void> {
    try {
      const response = await this.client.patch(
        `/pods/${this.config.deviceId}/acStates/on`,
        {
          newValue: actualState,
          reason: 'StateCorrectionByUser',
        },
        {
          params: {
            apiKey: this.config.apiKey,
          },
        }
      );

      if (response.data.status === 'success') {
        this.logger.info(`AC state synchronized to: ${actualState ? 'ON' : 'OFF'}`);
      } else {
        throw new Error(`API returned status: ${response.data.status}`);
      }
    } catch (error) {
      this.logger.error('Failed to sync power state:', error);
      throw new Error(`Failed to sync power state: ${error}`);
    }
  }
}