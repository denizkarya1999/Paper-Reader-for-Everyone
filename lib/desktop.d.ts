import type { AskPayload, AskResult, ConnectionState } from './ai-config';
declare global {
  interface Window {
    paperReader?: {
      openPdf: () => Promise<{ name: string; bytes: Uint8Array } | null>;
      savePdf: (value: { name: string; bytes: Uint8Array }) => Promise<boolean>;
      ask: (value: AskPayload & { id: string }) => Promise<AskResult>;
      getConnection: () => Promise<ConnectionState>;
      saveConnection: (value: { apiKey?: string; model: string; remember: boolean }) => Promise<ConnectionState>;
      clearConnection: () => Promise<ConnectionState>;
      cancel: (id: string) => void;
    };
  }
}
