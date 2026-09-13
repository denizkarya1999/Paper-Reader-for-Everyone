export type Rect = { x: number; y: number; width: number; height: number };
export type Selection = { page: number; kind: 'text' | 'area' | 'paper'; text: string; rects: Rect[]; image?: string };
export type Note = { id: string; selection: Selection; question: string; answer: string; color: 'yellow' | 'blue' | 'pink'; createdAt: string };
export type Paper = { id: string; name: string; bytes: Uint8Array; notes: Note[]; page: number; updatedAt: string };
export type Flashcard = { id: string; question: string; answer: string; page: number };
export type Chat = { id: string; paperId: string; question: string; answer: string; selection: Selection; model: string; createdAt: string; status: 'pending' | 'completed' | 'error' | 'cancelled' | 'interrupted'; error?: string; flashcards?: Flashcard[]; flashcardCount?: number };
