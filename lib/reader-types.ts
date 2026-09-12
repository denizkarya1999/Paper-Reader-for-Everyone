export type Rect = { x: number; y: number; width: number; height: number };
export type Selection = { page: number; kind: 'text' | 'area'; text: string; rects: Rect[]; image?: string };
export type Note = { id: string; selection: Selection; question: string; answer: string; color: 'yellow' | 'blue' | 'pink'; createdAt: string };
export type Paper = { id: string; name: string; bytes: Uint8Array; notes: Note[]; page: number; updatedAt: string };
