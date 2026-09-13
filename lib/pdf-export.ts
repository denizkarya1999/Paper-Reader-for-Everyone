import { APP_INFO } from './app-info';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { z } from 'zod';
import type { Note, Paper } from './reader-types';

const META = PDFName.of('PaperReaderNotesV1');
const COLORS = { yellow: [1, .84, .22], blue: [.4, .7, 1], pink: [1, .55, .7] };
const rectSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
const noteSchema = z.object({ id: z.string().min(1).max(100), question: z.string().max(4000), answer: z.string().max(20000), color: z.enum(['yellow', 'blue', 'pink']), createdAt: z.string().datetime(), selection: z.object({ page: z.number().int().positive(), kind: z.enum(['text', 'area', 'paper']), text: z.string().max(30000), rects: z.array(rectSchema).min(1).max(500) }) });

// Stored rectangles use the displayed, rotated crop box. Convert each point back
// to PDF user space so annotations stay aligned on rotated and cropped pages.
export function pdfPoint(page: PDFPage, x: number, y: number): [number, number] {
  const box = page.getCropBox();
  switch ((page.getRotation().angle % 360 + 360) % 360) {
    case 90: return [box.x + y * box.width, box.y + x * box.height];
    case 180: return [box.x + (1 - x) * box.width, box.y + y * box.height];
    case 270: return [box.x + (1 - y) * box.width, box.y + (1 - x) * box.height];
    default: return [box.x + x * box.width, box.y + (1 - y) * box.height];
  }
}
export async function importNotes(bytes: Uint8Array): Promise<Note[]> {
  const doc = await PDFDocument.load(bytes); const raw = doc.catalog.get(META);
  if (!(raw instanceof PDFHexString) && !(raw instanceof PDFString)) return [];
  try {
    const text = raw.decodeText(); if (text.length > 10_000_000) return [];
    const value = z.array(noteSchema).max(5000).safeParse(JSON.parse(text));
    return value.success ? value.data.filter(note => note.selection.page <= doc.getPageCount()) : [];
  } catch { return []; }
}
export async function exportPdf(paper: Paper): Promise<Uint8Array> {
  const doc = await PDFDocument.load(paper.bytes); const context = doc.context;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots(); if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const item = annots.lookup(i); if (!(item instanceof PDFDict)) continue;
      const name = item.get(PDFName.of('NM'));
      if ((name instanceof PDFHexString || name instanceof PDFString) && name.decodeText().startsWith('paper-reader:')) annots.remove(i);
    }
  }
  const validated = z.array(noteSchema).max(5000).parse(paper.notes);
  doc.catalog.set(META, PDFHexString.fromText(JSON.stringify(validated)));
  for (const note of validated) {
    const page = doc.getPage(note.selection.page - 1); const color = COLORS[note.color];
    let annots = page.node.Annots(); if (!annots) { annots = context.obj([]) as PDFArray; page.node.set(PDFName.of('Annots'), annots); }
    (note.selection.kind === 'paper' ? [] : note.selection.rects).forEach((rect, index) => {
      const tl = pdfPoint(page, rect.x, rect.y), tr = pdfPoint(page, Math.min(1, rect.x + rect.width), rect.y);
      const bl = pdfPoint(page, rect.x, Math.min(1, rect.y + rect.height)), br = pdfPoint(page, Math.min(1, rect.x + rect.width), Math.min(1, rect.y + rect.height));
      const points = [tl, tr, bl, br]; const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
      const annotation = context.obj({ Type: 'Annot', Subtype: note.selection.kind === 'text' ? 'Highlight' : 'Square', Rect: bounds, ...(note.selection.kind === 'text' ? { QuadPoints: points.flat(), CA: .35 } : { BS: { W: 1.5, S: 'D', D: [4, 3] } }), C: color, F: 4, NM: PDFString.of(`paper-reader:${note.id}:mark:${index}`) });
      annots!.push(context.register(annotation));
    });
    const rect = note.selection.rects[0]; const [x, y] = pdfPoint(page, Math.min(.94, rect.x + rect.width), rect.y);
    const body = note.question ? `Question: ${note.question}\n\n${note.answer}` : note.answer;
    const sticky = context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [x, y - 20, x + 20, y], Contents: PDFHexString.fromText(body), T: PDFHexString.fromText('Paper Reader for Everyone'), Subj: PDFHexString.fromText(note.selection.kind === 'paper' ? 'Whole-paper note' : `Page ${note.selection.page} note`), C: color, Name: 'Comment', Open: false, F: 4, NM: PDFString.of(`paper-reader:${note.id}:note`) });
    const stickyRef = context.register(sticky); annots.push(stickyRef);
    const popup = context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [x, y - 180, x + 240, y], Parent: stickyRef, Open: false, NM: PDFString.of(`paper-reader:${note.id}:popup`) });
    const popupRef = context.register(popup); sticky.set(PDFName.of('Popup'), popupRef); annots.push(popupRef);
  }
  doc.setProducer(APP_INFO.name + ' ' + APP_INFO.version);
  return doc.save();
}

export async function examplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman); const bold = await doc.embedFont(StandardFonts.TimesRomanBold); const sans = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(.12, .17, .24), muted = rgb(.4, .44, .5), blue = rgb(.19, .32, .73);
  const page = doc.addPage([612, 792]);
  const text = (value: string, x: number, y: number, size = 12, font = regular, color = ink) => page.drawText(value, { x, y, size, font, color, lineHeight: size * 1.5 });
  text('PAPER READER / A SHORT FIELD GUIDE', 62, 733, 9, sans, blue);
  page.drawLine({ start: { x: 62, y: 716 }, end: { x: 550, y: 716 }, thickness: .7, color: rgb(.8, .83, .88) });
  text('Reading research,', 62, 661, 32, bold); text('one good question at a time.', 62, 620, 32, bold);
  text('An example document to explore your new reading space.', 62, 586, 12, regular, muted);
  text('01   Start with the question', 62, 536, 17, bold);
  text('A research paper is an answer to a particular question. Before reading\nevery detail, identify what the authors wanted to understand and why\nit matters. The abstract is a useful starting point, but it is a summary,\nnot a substitute for the evidence.', 62, 506);
  text('02   Look closely at the evidence', 62, 407, 17, bold);
  text('Separate what was measured from what was inferred. A correlation\nbetween two variables does not, by itself, establish that one causes\nthe other. Consider sample size, uncertainty, and alternative explanations\nbefore accepting a conclusion.', 62, 377);
  page.drawRectangle({ x: 62, y: 174, width: 488, height: 100, color: rgb(.95, .97, 1), borderWidth: .6, borderColor: rgb(.78, .83, .95) });
  text('A SIMPLE EXAMPLE', 80, 251, 9, sans, blue);
  text('Observation', 80, 226, 12, bold); text('Question to ask', 307, 226, 12, bold);
  text('More reading is linked to higher scores.', 80, 204, 10); text('Could study time explain both?', 307, 204, 10);
  text('Try it: highlight a passage above, or crop the example box.\nAsk a question, then pin the answer as a sticky note.', 62, 132, 11, regular, muted);
  text('Example content created for Paper Reader for Everyone. No study is being cited.', 62, 55, 8, sans, muted); text('1', 541, 55, 9, sans, muted);
  const page2 = doc.addPage([612, 792]);
  page2.drawText('Keep a useful margin.', { x: 62, y: 680, size: 30, font: bold, color: ink });
  page2.drawText('03   Make the note yours', { x: 62, y: 615, size: 17, font: bold, color: ink });
  page2.drawText('A useful note records a question, an explanation, or a connection.\nKeep it short enough to be useful when you return to the paper.\n\nUse ChatGPT to clarify a selected passage, then check the answer\nagainst the source. Choose Whole paper to summarize the complete PDF.\n\nSave an annotated PDF to carry your notes into another PDF reader.\nYou can also reopen it here and continue editing.', { x: 62, y: 579, size: 13, lineHeight: 21, font: regular, color: ink });
  page2.drawText(APP_INFO.name + ' ' + APP_INFO.version + ' | ' + APP_INFO.developer, { x: 62, y: 55, size: 9, font: sans, color: muted });
  page2.drawText('2', { x: 541, y: 55, size: 9, font: sans, color: muted });
  doc.setTitle('A little guide to reading research'); doc.setAuthor('Deniz K. Acikbas'); return doc.save();
}
