import { app, BrowserWindow, ipcMain, Menu, net, protocol } from 'electron';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { CozeQuestion, CozeStreamEvent } from '../shared/types';
import { ensureConfigFile, getAssetPath, getRuntimeRoot, loadConfig, saveConfig } from './config';
import { CozeClient } from './coze/client';
import { createSpeechAdapter } from './speech';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tutor-avatar',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const avatarMounts = new Map<string, string>();
const speech = createSpeechAdapter();
let mainWindow: BrowserWindow | null = null;
let activeStream: {
  sender: Electron.WebContents;
  controller: AbortController;
  client: CozeClient;
  conversationId?: string;
} | null = null;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getConversationId(event: CozeStreamEvent): string | undefined {
  if (!isRecord(event.data) || typeof event.data.conversation_id !== 'string') {
    return undefined;
  }
  return event.data.conversation_id;
}

function getEventError(event: CozeStreamEvent): string {
  if (!isRecord(event.data)) {
    return `Coze 返回错误事件：${event.event}`;
  }
  const message = event.data.msg ?? event.data.message ?? event.data.last_error;
  return typeof message === 'string' ? message : `Coze 返回错误事件：${event.event}`;
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function createAvatarUrl(root: string, filePath: string, mountId: string): string {
  const relativePath = path.relative(root, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return `tutor-avatar://${mountId}/${relativePath}`;
}

async function getConfiguredAvatarUrl(): Promise<string | null> {
  const config = await loadConfig();
  const model = config.avatar.models[config.avatar.gender];
  if (!model) {
    return null;
  }

  const runtimeRoot = getRuntimeRoot();
  const modelPath = path.isAbsolute(model)
    ? path.resolve(model)
    : path.resolve(runtimeRoot, model);
  await access(modelPath);

  if (isWithin(runtimeRoot, modelPath)) {
    return createAvatarUrl(runtimeRoot, modelPath, 'app');
  }

  const mountId = `mount-${randomUUID()}`;
  avatarMounts.set(mountId, path.dirname(modelPath));
  return createAvatarUrl(path.dirname(modelPath), modelPath, mountId);
}

async function getConfiguredRuntimeUrl(): Promise<string | null> {
  const runtimePath = getAssetPath('avatar', 'runtime', 'live2dcubismcore.min.js');
  try {
    await access(runtimePath);
  } catch {
    return null;
  }
  return createAvatarUrl(getRuntimeRoot(), runtimePath, 'app');
}

function registerIpcHandlers(): void {
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:save', (_event, config) => saveConfig(config));

  ipcMain.handle('avatar:model-url', () => getConfiguredAvatarUrl());
  ipcMain.handle('avatar:runtime-url', () => getConfiguredRuntimeUrl());

  ipcMain.handle('speech:synthesize', (_event, text: unknown) => {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('待播报文本不能为空');
    }
    return speech.synthesize(text.trim());
  });
  ipcMain.handle('speech:listen', () => speech.listen());
  ipcMain.handle('speech:stop', () => speech.stop());

  ipcMain.handle('coze:start', async (event, question: CozeQuestion) => {
    if (activeStream) {
      throw new Error('已有一条回答正在生成');
    }
    if (!question || typeof question.question !== 'string' || !question.question.trim()) {
      throw new Error('问题不能为空');
    }

    const sender = event.sender;
    const controller = new AbortController();
    try {
      const config = await loadConfig();
      if (!config.coze.token || !config.coze.botId || !config.userId) {
        throw new Error('请先在设置中填写 Coze Token、智能体 ID 和用户 ID');
      }
      const client = new CozeClient({
        token: config.coze.token,
        botId: config.coze.botId,
        userId: config.userId,
      });
      activeStream = { sender, controller, client };

      try {
        for await (const streamEvent of client.stream(question, controller.signal)) {
          if (activeStream) {
            activeStream.conversationId = getConversationId(streamEvent) ?? activeStream.conversationId;
          }
          sender.send('coze:event', streamEvent);
          if (streamEvent.event === 'error' || streamEvent.event === 'conversation.chat.failed') {
            throw new Error(getEventError(streamEvent));
          }
        }
        sender.send('coze:event', { event: 'client.completed', data: null } satisfies CozeStreamEvent);
      } catch (error) {
        if (controller.signal.aborted) {
          sender.send('coze:event', { event: 'client.cancelled', data: null } satisfies CozeStreamEvent);
        } else {
          sender.send('coze:event', {
            event: 'client.error',
            data: { message: toErrorMessage(error) },
          } satisfies CozeStreamEvent);
        }
      } finally {
        activeStream = null;
      }
    } catch (error) {
      sender.send('coze:event', {
        event: 'client.error',
        data: { message: toErrorMessage(error) },
      } satisfies CozeStreamEvent);
    }
  });

  ipcMain.handle('coze:cancel', async () => {
    const current = activeStream;
    if (!current) {
      return;
    }
    current.controller.abort();
    if (current.conversationId) {
      try {
        await current.client.cancel(current.conversationId);
      } catch (error) {
        current.sender.send('coze:event', {
          event: 'client.cancel_error',
          data: { message: toErrorMessage(error) },
        } satisfies CozeStreamEvent);
      }
    }
  });
}

async function registerAvatarProtocol(): Promise<void> {
  await protocol.handle('tutor-avatar', async (request) => {
    const url = new URL(request.url);
    const root = url.hostname === 'app' ? getRuntimeRoot() : avatarMounts.get(url.hostname);
    if (!root) {
      return new Response('Unknown avatar mount', { status: 404 });
    }
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (!isWithin(root, filePath)) {
      return new Response('Avatar path is outside the configured model directory', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f4efe6',
    title: '语文课堂数字人',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(async () => {
  await ensureConfigFile();
  await registerAvatarProtocol();
  registerIpcHandlers();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
