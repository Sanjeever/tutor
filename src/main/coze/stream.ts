import type { CozeStreamEvent } from '../../shared/types';

function parseField(line: string): [string, string] {
  const separator = line.indexOf(':');
  if (separator < 0) {
    return [line, ''];
  }
  const field = line.slice(0, separator);
  const value = line.slice(separator + 1).replace(/^ /, '');
  return [field, value];
}

export async function* parseSseResponse(response: Response): AsyncGenerator<CozeStreamEvent> {
  if (!response.body) {
    throw new Error('Coze 返回为空，无法读取流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];

  const flush = (): CozeStreamEvent | null => {
    if (dataLines.length === 0) {
      eventName = '';
      return null;
    }

    const rawData = dataLines.join('\n');
    const event: CozeStreamEvent = {
      event: eventName || 'message',
      data: rawData === '[DONE]' ? null : (JSON.parse(rawData) as unknown),
    };
    eventName = '';
    dataLines = [];
    return event;
  };

  const processLine = (line: string): CozeStreamEvent | null => {
    if (line === '') {
      return flush();
    }
    if (line.startsWith(':')) {
      return null;
    }
    const [field, value] = parseField(line);
    if (field === 'event') {
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
    return null;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = processLine(line);
      if (event) {
        yield event;
      }
    }
    if (done) {
      break;
    }
  }

  if (buffer) {
    const event = processLine(buffer);
    if (event) {
      yield event;
    }
  }
  const event = flush();
  if (event) {
    yield event;
  }
}
