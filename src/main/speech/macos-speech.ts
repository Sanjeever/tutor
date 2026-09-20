import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getAssetPath } from '../config';
import type { SpeechAdapter } from './types';

export class MacOSSpeechAdapter implements SpeechAdapter {
  private activeProcess: ChildProcess | null = null;

  private run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
          reject(new Error(errorOutput.trim() || `${command} 退出码：${code}`));
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
      await this.run('say', [
        '-o',
        outputPath,
        '--file-format=WAVE',
        '--data-format=LEI16',
        text,
      ]);
      return new Uint8Array(await readFile(outputPath));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async listen(): Promise<string> {
    const scriptPath = getAssetPath('speech', 'macos-listen.swift');
    const text = await this.run('xcrun', ['swift', scriptPath]);
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
