import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, PDFName, PDFDict, PDFString, PDFHexString, degrees } from 'pdf-lib';

const temporary = await mkdtemp(path.join(tmpdir(), 'paper-reader-test-'));
await build({ entryPoints: ['lib/pdf-export.ts', 'lib/ask.ts'], bundle: true, platform: 'node', format: 'esm', outdir: temporary });
const { exportPdf, importNotes, examplePdf, pdfPoint } = await import(pathToFileURL(path.join(temporary, 'pdf-export.js')));
const { askHandler } = await import(pathToFileURL(path.join(temporary, 'ask.js')));
test.after(() => rm(temporary, { recursive: true, force: true }));

const note = { id: 'fixture-note', selection: { page: 1, kind: 'text', text: 'A correlation is not proof of causation.', rects: [{ x: .1, y: .3, width: .6, height: .03 }] }, question: 'What does this mean?', answer: 'It does not establish cause. Türkçe: ilişki, neden değildir. 日本語 ✓', color: 'yellow', createdAt: '2026-09-12T12:00:00.000Z' };
const paper = async (notes = [note]) => ({ id: 'test', name: 'source.pdf', bytes: await examplePdf(), notes, page: 1, updatedAt: note.createdAt });
const request = (body, headers = {}) => new Request('https://paper-reader.local/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openai-key': 'sk-test-placeholder', ...headers }, body: JSON.stringify(body) });
const body = { question: 'Explain this', text: 'Selected passage', page: 1, model: 'gpt-4.1-mini' };

test('PDF export retains all pages and native sticky notes with Unicode content', async () => {
  const bytes = await exportPdf(await paper());
  assert.deepEqual(await importNotes(bytes), [note]);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  const annots = doc.getPage(0).node.Annots();
  const values = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i));
  const sticky = values.find(v => v instanceof PDFDict && v.get(PDFName.of('Subtype')).toString() === '/Text');
  assert.match(sticky.get(PDFName.of('Contents')).decodeText(), /日本語 ✓/);
  assert.ok(sticky.get(PDFName.of('Popup')));
  assert.ok(values.some(v => v.get(PDFName.of('Subtype')).toString() === '/Highlight'));
});
test('re-export updates notes without duplicating annotations; deleted notes stay deleted', async () => {
  const original = await paper(); const bytes = await exportPdf(original);
  const updated = { ...note, answer: 'Revised answer', color: 'blue' };
  const saved = await exportPdf({ ...original, bytes, notes: [updated] });
  assert.deepEqual(await importNotes(saved), [updated]);
  const doc = await PDFDocument.load(saved); assert.equal(doc.getPage(0).node.Annots().size(), 3);
  const deleted = await exportPdf({ ...original, bytes: saved, notes: [] });
  assert.deepEqual(await importNotes(deleted), []);
  assert.equal((await PDFDocument.load(deleted)).getPage(0).node.Annots().size(), 0);
});
test('existing annotations from other PDF readers are preserved', async () => {
  const source = await paper(); const doc = await PDFDocument.load(source.bytes);
  doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [20, 20, 40, 40], Contents: PDFString.of('Existing comment'), NM: PDFString.of('someone-else') }))]));
  const saved = await exportPdf({ ...source, bytes: await doc.save() });
  assert.equal((await PDFDocument.load(saved)).getPage(0).node.Annots().size(), 4);
});
test('crop annotations work on rotated pages with nonzero crop-box origins', async () => {
  const doc = await PDFDocument.create(); const page = doc.addPage([700, 900]); page.setCropBox(20, 30, 600, 800);
  const expected = { 0: [170, 630], 90: [170, 230], 180: [470, 230], 270: [470, 630] };
  for (const angle of [0, 90, 180, 270]) { page.setRotation(degrees(angle)); assert.deepEqual(pdfPoint(page, .25, .25), expected[angle]); }
  page.setRotation(degrees(90));
  const source = await paper([{ ...note, selection: { ...note.selection, kind: 'area', image: 'data:image/png;base64,abc=' } }]);
  const bytes = await exportPdf({ ...source, bytes: await doc.save() });
  const saved = await PDFDocument.load(bytes); assert.equal(saved.getPage(0).getRotation().angle, 90);
  const annotation = saved.getPage(0).node.Annots().lookup(0);
  assert.equal(annotation.get(PDFName.of('Subtype')).toString(), '/Square');
  assert.equal((await importNotes(bytes))[0].selection.image, undefined);
});
test('invalid embedded note metadata is ignored safely', async () => {
  const doc = await PDFDocument.load(await examplePdf());
  doc.catalog.set(PDFName.of('PaperReaderNotesV1'), PDFHexString.fromText(JSON.stringify([{ ...note, selection: { ...note.selection, page: 999 } }])));
  assert.deepEqual(await importNotes(await doc.save()), []);
});
test('ChatGPT receives only selected content, no PDF or retained server response', async () => {
  let sent;
  const result = await askHandler(request(body), async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); sent = JSON.parse(options.body);
    return Response.json({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'A clear answer.' }] }] });
  });
  assert.equal((await result.json()).answer, 'A clear answer.');
  assert.equal(sent.store, false); assert.match(sent.input[0].content[0].text, /Selected passage/);
  assert.equal(sent.input[0].content.length, 1); assert.match(sent.instructions, /untrusted/);
});
test('crop request includes the image in the OpenAI input', async () => {
  const result = await askHandler(request({ ...body, text: '', image: 'data:image/png;base64,YWJj' }), async (_url, options) => {
    const value = JSON.parse(options.body); assert.equal(value.input[0].content[1].type, 'input_image');
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Chart explanation' }] }] });
  }); assert.equal(result.status, 200);
});
test('invalid key, empty selection, external image URL, and unsupported model never contact OpenAI', async () => {
  const fetcher = () => { assert.fail('Should not contact OpenAI'); };
  assert.equal((await askHandler(request(body, { 'x-openai-key': '' }), fetcher)).status, 401);
  assert.equal((await askHandler(request({ ...body, text: '' }), fetcher)).status, 400);
  assert.equal((await askHandler(request({ ...body, image: 'https://example.com/private.png' }), fetcher)).status, 400);
  assert.equal((await askHandler(request({ ...body, model: 'anything' }), fetcher)).status, 400);
  assert.equal((await askHandler(request(body, { origin: 'https://attacker.example' }), fetcher)).status, 403);
});
test('upstream failures return useful errors without disclosing credentials', async () => {
  const result = await askHandler(request(body), async () => Response.json({ error: { message: 'secret debug data' } }, { status: 429 }));
  assert.equal(result.status, 429); const value = await result.text();
  assert.match(value, /billing/); assert.doesNotMatch(value, /secret debug|sk-test/);
});
