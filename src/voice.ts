import say from 'say';
import winston from 'winston';

export class VoiceFeedback {
  private logger: winston.Logger;
  private isSpeaking = false;

  constructor(logger: winston.Logger) {
    this.logger = logger;
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isSpeaking) {
        this.logger.debug('Already speaking, skipping');
        resolve();
        return;
      }

      this.isSpeaking = true;
      this.logger.info(`Speaking: ${text}`);

      // Use Windows SAPI voice
      say.speak(text, undefined, 1.0, (err: any) => {
        this.isSpeaking = false;
        
        if (err) {
          this.logger.error('Speech error:', err);
          reject(err);
        } else {
          this.logger.debug('Speech completed');
          resolve();
        }
      });
    });
  }

  async announceTemperatures(targetTemp: number, roomTemp: number): Promise<void> {
    const message = `Target temperature: ${targetTemp} degrees. Current room temperature: ${Math.round(roomTemp)} degrees.`;
    await this.speak(message);
  }

  async announceACState(isOn: boolean, targetTemp: number): Promise<void> {
    const state = isOn ? 'on' : 'off';
    const message = `AC is ${state}. Target temperature: ${targetTemp} degrees.`;
    await this.speak(message);
  }

  async announceError(error: string): Promise<void> {
    await this.speak(`Error: ${error}`);
  }

  async announceSuccess(message: string): Promise<void> {
    await this.speak(message);
  }

  stop(): void {
    if (this.isSpeaking) {
      say.stop();
      this.isSpeaking = false;
      this.logger.info('Voice feedback stopped');
    }
  }
}