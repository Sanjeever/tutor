import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SpeechAdapter } from './types';

const synthesizeScript = [
  'Add-Type -AssemblyName System.Speech',
  '$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$voice.SetOutputToWaveFile($env:TUTOR_SPEECH_FILE)',
  '$voice.Speak($env:TUTOR_SPEECH_TEXT)',
  '$voice.Dispose()',
].join('; ');

const listenScript = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Speech',
  '$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine',
  '$recognizer.SetInputToDefaultAudioDevice()',
  '$recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))',
  '$result = $recognizer.Recognize()',
  'if ($null -ne $result) { [Console]::Write($result.Text) }',
  '$recognizer.Dispose()',
].join('; ');

export class WindowsSpeechAdapter implements SpeechAdapter {
  private activeProcess: ChildProcess | null = null;

  private runPowerShell(script: string, environment: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { ...process.env, ...environment },
        windowsHide: true,
      });
      this.activeProcess = child;
      let output = '';
      let errorOutput = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        errorOutput += chunk.toString('utf8');
      });
      child.once('error', (error) => {
        if (this.activeProcess === child) {
          this.activeProcess = null;
        }
        reject(error);
      });
      child.once('close', (code) => {
        if (this.activeProcess === child) {
          this.activeProcess = null;
        }
        if (code !== 0) {
          reject(new Error(errorOutput.trim() || `Windows Speech API 退出码：${code}`));
          return;
        }
        resolve(output.trim());
      });
    });
  }

  async synthesize(text: string): Promise<Uint8Array> {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tutor-speech-'));
    const outputPath = path.join(directory, 'speech.wav');
    try {
      await this.runPowerShell(synthesizeScript, {
        TUTOR_SPEECH_TEXT: text,
        TUTOR_SPEECH_FILE: outputPath,
      });
      return new Uint8Array(await readFile(outputPath));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async listen(): Promise<string> {
    const text = await this.runPowerShell(listenScript, {});
    if (!text) {
      throw new Error('没有识别到语音内容');
    }
    return text;
  }

  async stop(): Promise<void> {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill();
      this.activeProcess = null;
    }
  }
}
