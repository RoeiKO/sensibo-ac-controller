import { ChildProcess } from 'child_process';
import winston from 'winston';

export class VoiceFeedback {
  private logger: winston.Logger;
  private isSpeaking = false;
  private currentSpeechProcess: ChildProcess | null = null;
  private currentProcessTimeout: NodeJS.Timeout | null = null;
  private volume: number; // Volume (0-100 scale)
  private rate = 1; // Speech rate (0 = slowest, 10 = fastest, default is 0)

  constructor(logger: winston.Logger, volume: number = 30) {
    this.logger = logger;
    this.volume = Math.max(0, Math.min(100, volume));
    this.logger.info(`Voice feedback initialized with volume: ${this.volume}`);
  }

  private createPowerShellCommand(): { command: string; args: string[] } {
    // Use environment variable approach for safe parameter passing on Windows
    const command = 'powershell';
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Add-Type -AssemblyName System.Speech; ` +
      `$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
      `$speak.Volume = ${this.volume}; ` +
      `$speak.Rate = ${this.rate}; ` +
      `$speak.Speak([System.Environment]::GetEnvironmentVariable('SPEECH_TEXT')); ` +
      `$speak.Dispose();`
    ];
    
    return { command, args };
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isSpeaking) {
        this.logger.debug('Already speaking, stopping current speech');
        this.stop();
      }

      this.isSpeaking = true;
      this.logger.info(`Speaking at volume ${this.volume}: ${text}`);

      const { command, args } = this.createPowerShellCommand();
      
      // Use spawn with separate arguments for security
      import('child_process').then(({ spawn }) => {
        this.currentSpeechProcess = spawn(command, args, {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            SPEECH_TEXT: text // Pass text via environment variable to avoid injection
          }
        });

        const currentProcess = this.currentSpeechProcess;

        // Set timeout for THIS specific process with proper cleanup
        this.currentProcessTimeout = setTimeout(() => {
          if (this.currentSpeechProcess === currentProcess && !currentProcess.killed) {
            this.logger.warn('Speech process timeout, terminating');
            this.cleanupProcess(currentProcess, 'timeout');
          }
        }, 30000);

        currentProcess.on('close', (code) => {
          // Only handle if this is still the current process
          if (this.currentSpeechProcess === currentProcess) {
            this.cleanupCurrentProcess();
            
            if (code === 0 || code === null) {
              this.logger.debug('Speech completed successfully');
              resolve();
            } else {
              this.logger.error(`Speech process exited with code ${code}`);
              reject(new Error(`Speech failed with exit code ${code}`));
            }
          }
        });

        currentProcess.on('error', (error) => {
          // Only handle if this is still the current process
          if (this.currentSpeechProcess === currentProcess) {
            this.cleanupCurrentProcess();
            this.logger.error('Speech process error:', error);
            reject(error);
          }
        });
      }).catch(reject);
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
      this.logger.debug('Stopping current speech');
      const processToKill = this.currentSpeechProcess;
      this.cleanupProcess(processToKill, 'manual_stop');
    }
  }

  private cleanupCurrentProcess(): void {
    if (this.currentProcessTimeout) {
      clearTimeout(this.currentProcessTimeout);
      this.currentProcessTimeout = null;
    }
    this.currentSpeechProcess = null;
    this.isSpeaking = false;
  }

  private cleanupProcess(process: ChildProcess, reason: 'timeout' | 'manual_stop'): void {
    if (process && !process.killed) {
      // Try graceful termination first
      process.kill('SIGTERM');
      
      // Force kill after brief delay if process doesn't respond
      const forceKillTimeout = setTimeout(() => {
        if (process && !process.killed) {
          this.logger.warn(`Force killing speech process (reason: ${reason})`);
          process.kill('SIGKILL');
        }
      }, 1000); // Reduced to 1 second for faster cleanup

      // Clean up the force kill timeout when process exits
      process.once('exit', () => {
        clearTimeout(forceKillTimeout);
      });
    }

    // Clean up current process state if this is the active process
    if (this.currentSpeechProcess === process) {
      this.cleanupCurrentProcess();
      this.logger.info(`Voice feedback stopped (reason: ${reason})`);
    }
  }
}