import type { BailianClient } from './client';

const ASR_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

interface AudioFormat {
  format: string;
  mimeType: string;
}

export async function transcribe(
  client: BailianClient,
  audio: Uint8Array,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  if (audio.byteLength === 0) {
    throw new Error('录音没有包含音频数据');
  }

  const audioFormat = getAudioFormat(mimeType);
  const response = await client.post(ASR_PATH, {
    model: 'qwen-audio-3.0-asr-flash',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: `data:${audioFormat.mimeType};base64,${Buffer.from(audio).toString('base64')}`,
              },
            },
          ],
        },
      ],
    },
    parameters: {
      format: audioFormat.format,
      sample_rate: 16000,
    },
  }, signal);

  const text = getNestedString(response, ['output', 'text']);
  if (!text?.trim()) {
    throw new Error('百炼未识别到语音内容');
  }
  return text.trim();
}

function getAudioFormat(mimeType: string): AudioFormat {
  const normalized = mimeType.split(';', 1)[0].trim().toLowerCase();
  const formats: Record<string, AudioFormat> = {
    'audio/wav': { format: 'wav', mimeType: 'audio/wav' },
    'audio/wave': { format: 'wav', mimeType: 'audio/wav' },
    'audio/x-wav': { format: 'wav', mimeType: 'audio/wav' },
    'audio/mpeg': { format: 'mp3', mimeType: 'audio/mpeg' },
    'audio/mp3': { format: 'mp3', mimeType: 'audio/mpeg' },
    'audio/ogg': { format: 'ogg', mimeType: 'audio/ogg' },
    'audio/webm': { format: 'webm', mimeType: 'audio/webm' },
    'audio/mp4': { format: 'mp4', mimeType: 'audio/mp4' },
  };
  const format = formats[normalized];
  if (!format) {
    throw new Error(`不支持的录音格式：${mimeType || '未知'}，请使用 WAV 音频`);
  }
  return format;
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
