export type AvatarGender = 'female' | 'male';

export interface AvatarConfig {
  gender: AvatarGender;
  models: {
    female: string;
    male: string;
  };
}

export interface BailianConfig {
  workspaceId: string;
  apiKey: string;
}

export interface AppConfig {
  coze: {
    token: string;
    botId: string;
  };
  bailian: BailianConfig;
  userId: string;
  questions: string[];
  avatar: AvatarConfig;
}

export interface CozeStreamEvent {
  event: string;
  data: unknown;
}

export interface CozeQuestion {
  question: string;
  conversationId?: string;
}

export interface TutorApi {
  config: {
    get(): Promise<AppConfig>;
    save(config: AppConfig): Promise<AppConfig>;
  };
  coze: {
    start(question: CozeQuestion): Promise<void>;
    cancel(): Promise<void>;
    onEvent(listener: (event: CozeStreamEvent) => void): () => void;
  };
  speech: {
    synthesize(text: string): Promise<ArrayBuffer>;
    transcribe(audio: ArrayBuffer, mimeType: string): Promise<string>;
    stop(): Promise<void>;
  };
  avatar: {
    getModelUrl(): Promise<string | null>;
  };
}
