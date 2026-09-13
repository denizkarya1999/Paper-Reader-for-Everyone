import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import { exportPdf, importNotes } from './pdf-export';
import type { Chat, Paper } from './reader-types';
import { drawingSchema } from './drawing';
import { flashcardSchema, MAX_FLASHCARDS } from './flashcards';
import { MAX_CROPS, MAX_CROP_IMAGE_LENGTH, MAX_CROP_TOTAL_LENGTH, selectionCrops, selectionLabel, selectionRegions } from './crops';

export const MAX_BUNDLE_BYTES = 200_000_000;
const MAX_HISTORY_BYTES = 50_000_000;
const rect = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
const cropImage = z.string().max(MAX_CROP_IMAGE_LENGTH).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
const chatSchema = z.object({
  id: z.string().min(1).max(100), question: z.string().max(4000), answer: z.string().max(20000),
  model: z.string().max(100), createdAt: z.string().datetime(),
  status: z.enum(['pending', 'completed', 'error', 'cancelled', 'interrupted']), error: z.string().max(4000).optional(),
  flashcards: z.array(flashcardSchema).max(MAX_FLASHCARDS).optional(), flashcardCount: z.number().int().min(1).max(MAX_FLASHCARDS).optional(),
  selection: z.object({ page: z.number().int().positive().max(100000), kind: z.enum(['text', 'area', 'paper']), text: z.string().max(30000), rects: z.array(rect).min(1).max(500), image: cropImage.optional(), crops: z.array(z.object({ page: z.number().int().positive().max(100000), rect, image: cropImage.optional(), drawing: drawingSchema.optional() })).min(1).max(MAX_CROPS).optional() }).refine(selection => !selection.crops || (selection.kind === 'area' && !selection.image && selection.crops.reduce((total, crop) => total + (crop.image?.length ?? 0), 0) <= MAX_CROP_TOTAL_LENGTH && selection.crops.reduce((total, crop) => total + (crop.drawing?.source?.length ?? 0), 0) <= MAX_CROP_TOTAL_LENGTH)),
});
const historySchema = z.object({
  format: z.literal('paper-reader-bundle'), version: z.literal(1), pdfFile: z.literal('paper.pdf'),
  paperName: z.string().min(1).max(255), chats: z.array(chatSchema).max(10000),
}).refine(value => new Set(value.chats.map(chat => chat.id)).size === value.chats.length, 'Duplicate chat identifiers.');
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function historyHtml(paperName: string, chats: z.infer<typeof chatSchema>[]): string {
  const entries = chats.map(chat => '<article><header>' + escape(selectionLabel(chat.selection)) + ' · ' + escape(chat.model) + ' · ' + escape(chat.createdAt) + ' · ' + escape(chat.status) + '</header><h2>' + escape(chat.question) + '</h2>' + (chat.selection.text ? '<blockquote>' + escape(chat.selection.text) + '</blockquote>' : '') + selectionCrops(chat.selection).map((crop, index) => '<figure><figcaption>Crop ' + (index + 1) + ' · PDF page ' + crop.page + '</figcaption>' + (crop.image ? '<img alt="Selected PDF crop ' + (index + 1) + '" src="' + escape(crop.image) + '">' : '') + '</figure>').join('') + '<pre>' + escape(chat.answer || chat.error || 'No answer was saved.') + '</pre>' + (chat.flashcards || []).map((card, index) => '<section><h3>Flashcard ' + (index + 1) + ' · PDF page ' + card.page + '</h3><h4>' + escape(card.question) + '</h4><pre>' + escape(card.answer) + '</pre></section>').join('') + '</article>').join('\n');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><title>' + escape(paperName) + ' — chat history</title><style>body{max-width:850px;margin:40px auto;padding:0 24px;font:16px/1.7 system-ui;color:#26364c;background:#f6f8fb}article{background:white;border:1px solid #dce4ef;border-radius:12px;padding:24px;margin:20px 0}h1{font-size:28px}h2{font-size:18px}header{font-size:12px;color:#65758c}blockquote{border-left:3px solid #bed0ef;margin-left:0;padding-left:16px;color:#52657e}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}img{max-width:100%;max-height:600px}body>p{color:#65758c}</style><h1>' + escape(paperName) + '</h1><p>Chat history · Paper Reader for Everyone · ' + chats.length + ' exchanges</p>' + (entries || '<p>No chats were saved.</p>') + '</html>';
}
export async function exportBundle(paper: Paper, chats: Chat[]): Promise<Uint8Array> {
  const history = historySchema.parse({ format: 'paper-reader-bundle', version: 1, pdfFile: 'paper.pdf', paperName: paper.name, chats: chats.filter(chat => chat.paperId === paper.id).map(chat => ({ ...chat, status: chat.status === 'pending' ? 'interrupted' : chat.status })) });
  const pdf = await exportPdf(paper);
  const json = strToU8(JSON.stringify(history, null, 2));
  const html = strToU8(historyHtml(history.paperName, history.chats));
  if (pdf.length > 150_000_000 || json.length > MAX_HISTORY_BYTES || pdf.length + json.length + html.length > MAX_BUNDLE_BYTES) throw new Error('This bundle is too large. Save the PDF separately, or delete unneeded chats before making a bundle.');
  const bytes = zipSync({
    'paper.pdf': pdf,
    'chat-history.json': json,
    'chat-history.html': html,
    'README.txt': strToU8('Paper Reader for Everyone\n\npaper.pdf: annotated PDF with your sticky notes.\nchat-history.html: readable chat history; open in a browser.\nchat-history.json: chat data for restoring inside Paper Reader.\n\nOpen this ZIP in Paper Reader for Everyone 1.5 or later to restore the PDF, chats, and editable crop drawings. Older versions may show only the first crop. No API key is included.\n'),
  }, { level: 6 });
  if (bytes.length > MAX_BUNDLE_BYTES) throw new Error('This bundle exceeds the 200 MB limit.');
  return bytes;
}
export async function importBundle(bytes: Uint8Array): Promise<{ paper: Paper; chats: Chat[] }> {
  if (bytes.length > MAX_BUNDLE_BYTES) throw new Error('Choose a saved bundle smaller than 200 MB.');
  let files: Record<string, Uint8Array>;
  try {
    const seen = new Set<string>(); let total = 0;
    files = unzipSync(bytes, { filter: file => {
      if (file.name !== 'paper.pdf' && file.name !== 'chat-history.json') return false;
      const limit = file.name === 'paper.pdf' ? 150_000_000 : MAX_HISTORY_BYTES;
      if (seen.has(file.name) || file.originalSize > limit || file.originalSize < 1) throw new Error('Unsafe bundle size or duplicate entry.');
      seen.add(file.name); total += file.originalSize;
      if (total > MAX_BUNDLE_BYTES) throw new Error('Bundle too large.');
      return true;
    } });
  } catch { throw new Error('This ZIP is not a valid Paper Reader bundle or exceeds the size limit.'); }
  if (!files['paper.pdf'] || !files['chat-history.json']) throw new Error('This ZIP needs paper.pdf and chat-history.json from Save PDF + chats.');
  let data;
  try { data = JSON.parse(strFromU8(files['chat-history.json'])); } catch { throw new Error('The chat history in this bundle is damaged.'); }
  const parsed = historySchema.safeParse(data);
  if (!parsed.success) throw new Error('The chat history in this bundle is damaged or uses an unsupported format.');
  const pdf = files['paper.pdf'];
  const { PDFDocument } = await import('pdf-lib');
  const document = await PDFDocument.load(pdf);
  if (parsed.data.chats.some(chat => chat.selection.page > document.getPageCount() || selectionRegions(chat.selection).some(region => region.page > document.getPageCount()) || chat.flashcards?.some(card => card.page > document.getPageCount()))) throw new Error('A chat or flashcard in this bundle points to a page that is missing from its PDF.');
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pdf)))).map(b => b.toString(16).padStart(2, '0')).join('');
  const paper: Paper = { id, name: parsed.data.paperName, bytes: pdf, notes: await importNotes(pdf), page: 1, updatedAt: new Date().toISOString() };
  const chats: Chat[] = parsed.data.chats.map(chat => ({ ...chat, paperId: id, status: chat.status === 'pending' ? 'interrupted' : chat.status }));
  return { paper, chats };
}
