export const MODEL_IDS = ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-4.1-mini', 'gpt-4.1'] as const;
export const MODELS = [
  { id: 'gpt-6-astra', label: 'GPT-6 Astra · most capable' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol · complex work' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra · balanced' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna · everyday reading' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini · previous generation' },
  { id: 'gpt-4.1', label: 'GPT-4.1 · previous generation' },
] as const;
export const DEFAULT_MODEL = 'gpt-5.6-luna';
// Stay below the API's 50 MB file limit, measured before Base64 encoding.
export const MAX_PAPER_BYTES = 50_000_000 - 1;
export const SUMMARY_QUESTION = 'Summarize the whole document in plain language. Cover its main question, approach, key findings, limitations, and practical takeaway. Include page or slide references for the main findings.';
export type AskPayload = { question: string; model: string; sourceKind?: 'pdf' | 'slides'; pdf: { filename: string; data: string } } & (
  { scope: 'selection'; text: string; image?: string; crops?: { page: number; image: string }[]; page: number } |
  { scope: 'paper' }
);
export type AskResult = { answer?: string; error?: string; incomplete?: boolean };
export type ConnectionState = { hasKey: boolean; saved: boolean; model: string; canRemember: boolean; error?: string };
