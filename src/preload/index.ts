import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, CozeQuestion, CozeStreamEvent, TutorApi } from '../shared/types';

const api: TutorApi = {
  config: {
    get: () => ipcRenderer.invoke('config:get') as Promise<AppConfig>,
    save: (config) => ipcRenderer.invoke('config:save', config) as Promise<AppConfig>,
  },
  coze: {
    start: (question: CozeQuestion) => ipcRenderer.invoke('coze:start', question) as Promise<void>,
    cancel: () => ipcRenderer.invoke('coze:cancel') as Promise<void>,
    onEvent: (listener: (event: CozeStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, event: CozeStreamEvent) => listener(event);
      ipcRenderer.on('coze:event', handler);
      return () => ipcRenderer.removeListener('coze:event', handler);
    },
  },
  speech: {
    synthesize: async (text: string) => {
      const bytes = (await ipcRenderer.invoke('speech:synthesize', text)) as Uint8Array;
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },
    listen: () => ipcRenderer.invoke('speech:listen') as Promise<string>,
    stop: () => ipcRenderer.invoke('speech:stop') as Promise<void>,
  },
  avatar: {
    getModelUrl: () => ipcRenderer.invoke('avatar:model-url') as Promise<string | null>,
    getRuntimeUrl: () => ipcRenderer.invoke('avatar:runtime-url') as Promise<string | null>,
  },
};

contextBridge.exposeInMainWorld('tutor', api);
