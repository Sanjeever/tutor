import type { AvatarGender } from '../../shared/types';
import type { BailianClient } from './client';

const TTS_PATH = '/api/v1/services/audio/tts/SpeechSynthesizer';

const voices: Record<AvatarGender, string> = {
  male: 'xunanchuan_v3.1',
  female: 'longanlingxin_v3.1',
};

export async function synthesize(
  client: BailianClient,
  text: string,
  gender: AvatarGender,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await client.post(TTS_PATH, {
    model: 'qwen-audio-3.1-tts-flash',
    input: {
      text,
      voice: voices[gender],
      format: 'wav',
      sample_rate: 24000,
    },
  }, signal);

  const url = getNestedString(response, ['output', 'audio', 'url']);
  if (!url) {
    throw new Error('百炼没有返回可播放的音频地址');
  }
  const audio = await client.download(url, signal);
  if (audio.byteLength === 0) {
    throw new Error('百炼返回了空音频');
  }
  return audio;
}

function getNestedString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : null;
}
