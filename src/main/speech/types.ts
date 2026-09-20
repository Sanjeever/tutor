export interface SpeechAdapter {
  synthesize(text: string): Promise<Uint8Array>;
  listen(): Promise<string>;
  stop(): Promise<void>;
}
