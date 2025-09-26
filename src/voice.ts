import { exec, ChildProcess } from 'child_process';
import winston from 'winston';

export class VoiceFeedback {
  private logger: winston.Logger;
  private isSpeaking = false;
  private currentSpeechProcess: ChildProcess | null = null;
  private volume: number; // Volume (0-100 scale)
  private rate = 1; // Speech rate (0 = slowest, 10 = fastest, default is 0)

  constructor(logger: winston.Logger, volume: number = 30) {
    this.logger = logger;
    this.volume = Math.max(0, Math.min(100, volume));
    this.logger.info(`Voice feedback initialized with volume: ${this.volume}`);
  }

  private createPowerShellCommand(text: string): string {
    // Escape special characters for PowerShell
    const escapedText = text
      .replace(/"/g, '`"')
      .replace(/'/g, "''")
      .replace(/\$/g, '`$');
    
    // PowerShell command to speak with controlled volume
    return `powershell -Command "Add-Type -AssemblyName System.speech; ` +
      `$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
      `$speak.Volume = ${this.volume}; ` +
      `$speak.Rate = ${this.rate}; ` +
      `$speak.Speak('${escapedText}'); ` +
      `$speak.Dispose();"`;
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isSpeaking) {
        this.logger.debug('Already speaking, stopping current speech');
        this.stop();
      }

      this.isSpeaking = true;
      this.logger.info(`Speaking at volume ${this.volume}: ${text}`);

      const command = this.createPowerShellCommand(text);
      
      // Use exec instead of execAsync to get the child process
      this.currentSpeechProcess = exec(command, { 
        windowsHide: true,
        timeout: 30000 // 30 second timeout
      }, (error) => {
        this.currentSpeechProcess = null;
        this.isSpeaking = false;
        
        if (error) {
          // Check if error is due to process being killed
          if (error.killed || error.signal === 'SIGTERM') {
            this.logger.debug('Speech was stopped');
            resolve();
          } else {
            this.logger.error('Speech error:', error);
            reject(error);
          }
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

  setVolume(volume: number): void {
    // Clamp volume between 0 and 100
    this.volume = Math.max(0, Math.min(100, volume));
    this.logger.info(`Voice volume set to ${this.volume}`);
  }

  setRate(rate: number): void {
    // Clamp rate between -10 and 10
    this.rate = Math.max(-10, Math.min(10, rate));
    this.logger.info(`Voice rate set to ${this.rate}`);
  }

  stop(): void {
    if (this.isSpeaking && this.currentSpeechProcess) {
      // Kill the specific PowerShell process that's currently speaking
      this.currentSpeechProcess.kill();
      this.currentSpeechProcess = null;
      this.isSpeaking = false;
      this.logger.info('Voice feedback stopped');
    }
  }
}