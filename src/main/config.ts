import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from '../shared/types';

const emptyConfig: AppConfig = {
  coze: {
    token: '',
    botId: '',
  },
  userId: 'classroom-student',
  questions: [
    '《春》里“春风又绿江南岸”的“绿”用得好在哪里？',
    '请用一个生活中的例子解释什么是比喻。',
    '读完一篇记叙文后，怎样快速找到文章的中心思想？',
  ],
  avatar: {
    model: 'assets/avatar/hiyori/Hiyori.model3.json',
  },
};

export function getRuntimeRoot(): string {
  return app.isPackaged ? process.resourcesPath : process.cwd();
}

export function getConfigPath(): string {
  return path.join(getRuntimeRoot(), 'config', 'config.json');
}

export function getAssetPath(...segments: string[]): string {
  return path.join(getRuntimeRoot(), 'assets', ...segments);
}

function parseConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('config/config.json 必须是 JSON 对象');
  }

  const source = value as Partial<AppConfig>;
  if (!source.coze || typeof source.coze !== 'object') {
    throw new Error('配置缺少 coze 字段');
  }
  if (!source.avatar || typeof source.avatar !== 'object') {
    throw new Error('配置缺少 avatar 字段');
  }

  const coze = source.coze as Partial<AppConfig['coze']>;
  const avatar = source.avatar as Partial<AppConfig['avatar']>;
  if (typeof coze.token !== 'string' || typeof coze.botId !== 'string') {
    throw new Error('coze.token 和 coze.botId 必须是字符串');
  }
  if (typeof avatar.model !== 'string') {
    throw new Error('avatar.model 必须是字符串');
  }
  if (typeof source.userId !== 'string') {
    throw new Error('userId 必须是字符串');
  }
  if (!Array.isArray(source.questions) || source.questions.some((item) => typeof item !== 'string')) {
    throw new Error('questions 必须是字符串数组');
  }

  return {
    coze: {
      token: coze.token.trim(),
      botId: coze.botId.trim(),
    },
    userId: source.userId.trim(),
    questions: source.questions.map((question) => question.trim()).filter(Boolean),
    avatar: {
      model: avatar.model.trim(),
    },
  };
}

export async function ensureConfigFile(): Promise<void> {
  const configPath = getConfigPath();
  try {
    await readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(emptyConfig, null, 2)}\n`, 'utf8');
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const content = await readFile(getConfigPath(), 'utf8');
  return parseConfig(JSON.parse(content) as unknown);
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  const parsed = parseConfig(config);
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return parsed;
}
