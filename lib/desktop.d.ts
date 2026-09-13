import type { AskPayload, AskResult, ConnectionState } from './ai-config';
import type { FocusReply, FocusSettings } from './focus-types';
import type { SupportPayload } from './reading-support';
declare global {
  interface Window {
    paperReader?: {
      openPdf: () => Promise<{ name: string; bytes: Uint8Array } | null>;
      savePdf: (value: { name: string; bytes: Uint8Array }) => Promise<boolean>;
      saveBundle: (value: { name: string; bytes: Uint8Array }) => Promise<boolean>;
      getFocus: () => Promise<FocusSettings>;
      saveFocus: (value: FocusSettings) => Promise<FocusSettings>;
      focusContext: (id: string | null) => void;
      focusReply: (value: FocusReply) => Promise<boolean>;
      onFocusReminder: (callback: (token: string) => void) => () => void;
      onFocusCancel: (callback: (token: string) => void) => () => void;
      ask: (value: (AskPayload | SupportPayload) & { id: string }) => Promise<AskResult>;
      getConnection: () => Promise<ConnectionState>;
      saveConnection: (value: { apiKey?: string; model: string; remember: boolean }) => Promise<ConnectionState>;
      clearConnection: () => Promise<ConnectionState>;
      cancel: (id: string) => void;
    };
  }
}
