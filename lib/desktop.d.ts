import type { AskPayload, AskResult, ConnectionState } from './ai-config';
import type { FocusReply, FocusSettings } from './focus-types';
import type { SupportPayload } from './reading-support';
import type { SpeechState } from '../components/read-aloud';
import type { UpdateState } from '../components/updates-panel';
declare global {
  interface Window {
    readerSpeech?: {
      getState: () => SpeechState;
      subscribe: (callback: (state: SpeechState) => void) => () => void;
      start: (id: string, text: string) => Promise<void>;
      startPage: (id: string, value: { text: string; image?: string; label: string }) => Promise<void>;
      stop: () => void;
      pause: () => void;
    };
    paperReader?: {
      getUpdates: () => Promise<UpdateState>;
      checkUpdates: () => Promise<UpdateState>;
      setAutomaticUpdates: (value: boolean) => Promise<UpdateState>;
      installUpdate: () => Promise<UpdateState>;
      onUpdates: (callback: (state: UpdateState) => void) => () => void;
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
