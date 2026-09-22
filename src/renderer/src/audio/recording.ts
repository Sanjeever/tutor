const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

const TARGET_SAMPLE_RATE = 16000;
const MAX_RECORDING_SECONDS = 5 * 60;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function getRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前环境不支持浏览器录音');
  }
  const mimeType = RECORDING_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    throw new Error('当前环境没有可用的录音格式');
  }
  return mimeType;
}

export async function convertRecordingToWav(blob: Blob): Promise<ArrayBuffer> {
  if (blob.size === 0) {
    throw new Error('没有录到音频内容');
  }

  const context = new AudioContext();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(await blob.arrayBuffer());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`录音格式无法解析：${message}`);
    }
    if (decoded.duration > MAX_RECORDING_SECONDS) {
      throw new Error('录音时长不能超过 5 分钟');
    }
    const samples = resampleToMono(decoded, TARGET_SAMPLE_RATE);
    const wav = encodeWav(samples, TARGET_SAMPLE_RATE);
    if (wav.byteLength > MAX_AUDIO_BYTES) {
      throw new Error('录音文件不能超过 10 MB');
    }
    return wav;
  } finally {
    await context.close();
  }
}

function resampleToMono(buffer: AudioBuffer, targetSampleRate: number): Float32Array {
  const outputLength = Math.max(1, Math.round(buffer.length * targetSampleRate / buffer.sampleRate));
  const output = new Float32Array(outputLength);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const channelCount = channels.length;

  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const sourcePosition = outputIndex * buffer.sampleRate / targetSampleRate;
    const sourceIndex = Math.floor(sourcePosition);
    const nextIndex = Math.min(sourceIndex + 1, buffer.length - 1);
    const fraction = sourcePosition - sourceIndex;
    let sample = 0;
    for (const channel of channels) {
      sample += channel[sourceIndex] * (1 - fraction) + channel[nextIndex] * fraction;
    }
    output[outputIndex] = sample / channelCount;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(44 + index * bytesPerSample, value, true);
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
