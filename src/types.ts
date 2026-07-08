declare global {
  interface Window {
    pluginActivators?: Record<string, { activate(): void; deactivate(): void }>;
  }
}

export type NoteType = 'info' | 'warn' | 'alert' | 'note' | 'tips';

export interface NoteBlock {
  container: HTMLDivElement;
  restore: () => void;
}
