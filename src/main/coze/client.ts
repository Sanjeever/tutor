import type { CozeQuestion, CozeStreamEvent } from '../../shared/types';
import { parseSseResponse } from './stream';

const COZE_CHAT_URL = 'https://api.coze.cn/v3/chat';
const COZE_CANCEL_URL = 'https://api.coze.cn/v3/chat/cancel';

interface CozeClientOptions {
  token: string;
  botId: string;
  userId: string;
}

export class CozeClient {
  constructor(private readonly options: CozeClientOptions) {}

  async *stream(question: CozeQuestion, signal: AbortSignal): AsyncGenerator<CozeStreamEvent> {
    const url = new URL(COZE_CHAT_URL);
    if (question.conversationId) {
      url.searchParams.set('conversation_id', question.conversationId);
    }

    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: this.options.botId,
        user_id: this.options.userId,
        stream: true,
        auto_save_history: true,
        additional_messages: [
          {
            role: 'user',
            content: question.question,
            content_type: 'text',
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Coze 请求失败（${response.status}）：${body || response.statusText}`);
    }

    yield* parseSseResponse(response);
  }

  async cancel(conversationId: string, signal?: AbortSignal): Promise<void> {
    const url = new URL(COZE_CANCEL_URL);
    url.searchParams.set('conversation_id', conversationId);
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`取消 Coze 对话失败（${response.status}）：${body || response.statusText}`);
    }
  }
}
