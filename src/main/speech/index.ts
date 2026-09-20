import { MacOSSpeechAdapter } from './macos-speech';
import type { SpeechAdapter } from './types';
import { WindowsSpeechAdapter } from './windows-speech';

export function createSpeechAdapter(): SpeechAdapter {
  if (process.platform === 'win32') {
    return new WindowsSpeechAdapter();
  }
  if (process.platform === 'darwin') {
    return new MacOSSpeechAdapter();
  }
  throw new Error(`暂不支持当前平台的系统语音能力：${process.platform}`);
}
