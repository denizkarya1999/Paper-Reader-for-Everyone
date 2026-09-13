import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, PDFName, PDFString, degrees } from 'pdf-lib';
const directory = await mkdtemp(path.join(tmpdir(), 'reader-drawing-'));
await build({ entryPoints: ['lib/page-text.ts', 'lib/drawing.ts', 'lib/crops.ts', 'lib/pdf-export.ts', 'lib/paper-bundle.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory });
const load = name => import(pathToFileURL(path.join(directory, name + '.js')));
const { strokePaths, drawingSchema } = await load('drawing');
const { cropsSelection, replaceCrop } = await load('crops');
const { exportPdf, importNotes, readerPdfBytes } = await load('pdf-export');
const { exportBundle, importBundle } = await load('paper-bundle');
test.after(() => rm(directory, { recursive: true, force: true }));
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const stroke = { tool: 'pen', color: '#dc2626', width: .004, points: [{ x: .2, y: .3 }, { x: .7, y: .6 }] };
const drawing = { source: image, width: 600, height: 250, strokes: [stroke, { ...stroke, tool: 'highlighter', color: '#eab308', width: .03 }, { ...stroke, tool: 'arrow' }, { ...stroke, tool: 'ellipse' }] };
const crop = { page: 1, rect: { x: .1, y: .2, width: .6, height: .25 }, image, drawing };
const date = '2026-09-13T02:00:00.000Z';
test('drawing geometry maps normalized pen, circle and arrow paths consistently at any zoom', () => {
  assert.deepEqual(strokePaths(stroke, 100, 200), [[{ x: 20, y: 60 }, { x: 70, y: 120 }]]);
  const ellipse = strokePaths({ ...stroke, tool: 'ellipse' }, 100, 200)[0];
  assert.equal(ellipse.length, 65); assert.ok(ellipse.every(p => p.x >= 20 && p.x <= 70 && p.y >= 60 && p.y <= 120));
  assert.equal(strokePaths({ ...stroke, tool: 'arrow' }, 100, 200).length, 2);
  assert.equal(drawingSchema.safeParse(drawing).success, true);
  assert.equal(drawingSchema.safeParse({ ...drawing, source: 'https://example.com/image.png' }).success, false);
  assert.equal(drawingSchema.safeParse({ ...drawing, strokes: [{ ...stroke, points: [{ x: -1, y: 0 }] }] }).success, false);
  const selection = cropsSelection([{ ...crop, drawing: undefined }]);
  const updated = replaceCrop(selection, 0, crop); assert.equal(selection.crops[0].drawing, undefined); assert.deepEqual(updated.crops[0].drawing, drawing);
  assert.throws(() => replaceCrop(selection, 0, { ...crop, image: 'a'.repeat(5_000_001) }), /too large/);
});
test('marked notes survive rotated PDF export, export twice without duplication and retain other readers’ annotations', async () => {
  const document = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) { const page = document.addPage([700, 900]); page.setCropBox(20, 30, 600, 800); page.setRotation(degrees(rotation)); }
  const external = document.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [30, 40, 80, 90], NM: PDFString.of('other-reader') });
  document.getPage(0).node.set(PDFName.of('Annots'), document.context.obj([document.context.register(external)]));
  const selection = cropsSelection([1, 2, 3, 4].map(page => ({ ...crop, page })));
  const note = { id: 'drawing-note', selection, question: 'Explain marked details.', answer: 'A saved explanation.', color: 'yellow', createdAt: date };
  const paper = { id: 'drawing-paper', name: 'drawing.pdf', bytes: await document.save(), notes: [note], page: 1, updatedAt: date };
  const saved = await exportPdf(paper), restored = await importNotes(saved);
  assert.equal(restored[0].selection.crops[0].drawing.source, undefined); assert.deepEqual(restored[0].selection.crops[0].drawing.strokes, drawing.strokes);
  for (const bytes of [saved, await exportPdf({ ...paper, bytes: saved, notes: restored })]) {
    const doc = await PDFDocument.load(bytes);
    for (const [index, page] of doc.getPages().entries()) {
      const annotations = page.node.Annots(); assert.equal(annotations.size(), index ? 7 : 8);
      const inks = Array.from({ length: annotations.size() }, (_, i) => annotations.lookup(i)).filter(item => item.get(PDFName.of('Subtype')).toString() === '/Ink');
      assert.equal(inks.length, 4); assert.ok(inks.every(ink => ink.has(PDFName.of('AP'))));
    }
  }
  const display = await PDFDocument.load(await readerPdfBytes(saved));
  assert.equal(display.getPage(0).node.Annots().size(), 1); assert.equal(display.getPage(1).node.Annots().size(), 0);
  const chat = { id: 'drawing-chat', paperId: paper.id, selection, question: note.question, answer: note.answer, status: 'completed', model: 'gpt-4.1-mini', createdAt: date };
  const bundle = await importBundle(await exportBundle(paper, [chat]));
  assert.deepEqual(bundle.chats[0].selection.crops[0].drawing, drawing);
});

test('page reading preserves line endings and ignores non-text PDF records', async () => {
  const { pageText } = await load('page-text');
  assert.equal(pageText([{ type: 'beginMarkedContent' }, { str: 'Heading', hasEOL: true }, { str: 'First' }, { str: 'paragraph.', hasEOL: true }]), 'Heading\nFirst paragraph.');
  assert.equal(pageText([{ type: 'endMarkedContent' }]), '');
});
