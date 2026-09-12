export {};
declare global {
  interface Window {
    paperReader?: {
      openPdf: () => Promise<{ name: string; bytes: Uint8Array } | null>;
      savePdf: (value: { name: string; bytes: Uint8Array }) => Promise<boolean>;
      ask: (value: { id: string; apiKey: string; question: string; text: string; image?: string; page: number; model: string }) => Promise<{ answer?: string; error?: string; incomplete?: boolean }>;
      cancel: (id: string) => void;
    };
  }
}
