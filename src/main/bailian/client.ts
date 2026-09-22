import type { AvatarGender, BailianConfig } from '../../shared/types';
import { transcribe } from './asr';
import { synthesize } from './tts';

const BAILIAN_REGION = 'cn-beijing';

export class BailianClient {
  private readonly workspaceId: string;
  private readonly apiKey: string;

  constructor(config: BailianConfig) {
    this.workspaceId = config.workspaceId.trim();
    this.apiKey = config.apiKey.trim();
    if (!this.workspaceId) {
      throw new Error('百炼 Workspace ID 未配置，请在设置中填写');
    }
    if (!this.apiKey) {
      throw new Error('百炼 API Key 未配置，请在设置中填写');
    }
  }

  transcribe(audio: Uint8Array, mimeType: string, signal?: AbortSignal): Promise<string> {
    return transcribe(this, audio, mimeType, signal);
  }

  synthesize(text: string, gender: AvatarGender, signal?: AbortSignal): Promise<Uint8Array> {
    return synthesize(this, text, gender, signal);
  }

  async post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(path.includes('/multimodal-generation/') ? { 'X-DashScope-SSE': 'disable' } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    return this.readJson(response);
  }

  async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await this.fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`百炼音频下载失败（HTTP ${response.status}）`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private get baseUrl(): string {
    return `https://${this.workspaceId}.${BAILIAN_REGION}.maas.aliyuncs.com`;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (init.signal?.aborted) {
        throw createAbortError();
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`百炼网络请求失败：${message}`);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    const raw = await response.text();
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        if (!response.ok) {
          throw new Error(`百炼请求失败（HTTP ${response.status}）`);
        }
        throw new Error('百炼返回了无法解析的响应');
      }
    }

    if (!response.ok) {
      throw new Error(formatBailianError(response.status, body));
    }
    return body;
  }
}

export function createAbortError(): Error {
  const error = new Error('百炼请求已取消');
  error.name = 'AbortError';
  return error;
}

function formatBailianError(status: number, body: unknown): string {
  if (isRecord(body)) {
    const code = typeof body.code === 'string' ? body.code : '';
    const message = typeof body.message === 'string'
      ? body.message
      : typeof body.msg === 'string'
        ? body.msg
        : '';
    if (message) {
      return `百炼请求失败${code ? `（${code}）` : ''}：${message}`;
    }
  }
  return `百炼请求失败（HTTP ${status}）`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
