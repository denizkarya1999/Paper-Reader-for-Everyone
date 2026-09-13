import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const directory = await mkdtemp(path.join(tmpdir(), 'reader-crops-'));
await build({ entryPoints: ['lib/crops.ts', 'lib/ask.ts', 'lib/pdf-export.ts', 'lib/paper-bundle.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory });
const load = name => import(pathToFileURL(path.join(directory, name + '.js')));
const { appendCrop, cropsSelection, selectionCrops, selectionRegions, MAX_CROPS, MAX_CROP_IMAGE_LENGTH, MAX_CROP_TOTAL_LENGTH } = await load('crops');
const { askHandler, questionSchema, MAX_REQUEST_BYTES } = await load('ask');
const { examplePdf, exportPdf, importNotes } = await load('pdf-export');
const { exportBundle, importBundle } = await load('paper-bundle');
test.after(() => rm(directory, { recursive: true, force: true }));
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
const rect = { x: .1, y: .2, width: .3, height: .1 };
const single = { kind: 'area', page: 1, text: '', rects: [rect], image };
const multi = appendCrop(single, { ...single, page: 2 });
const date = '2026-09-13T02:00:00.000Z';
const note = { id: 'multi-note', selection: multi, question: 'Compare these areas.', answer: 'A saved answer.', color: 'yellow', createdAt: date };
const paper = { id: 'test-paper', name: 'paper.pdf', bytes: await examplePdf(), notes: [note], page: 1, updatedAt: date };
const pdf = { filename: 'paper.pdf', data: 'data:application/pdf;base64,' + Buffer.from(paper.bytes).toString('base64') };
const body = { scope: 'selection', question: 'Compare the selected figures.', model: 'gpt-4.1-mini', pdf, text: '', page: 1, crops: multi.crops.map(({ page, image }) => ({ page, image })) };
const request = value => new Request('https://paper-reader.local/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openai-key': 'sk-test-placeholder' }, body: JSON.stringify(value) });

test('append across pages, remove the first crop, and clear without mutating earlier selections', () => {
  assert.equal(multi.crops.length, 2);
  assert.deepEqual(multi.crops.map(crop => crop.page), [1, 2]);
  assert.equal(single.crops, undefined);
  assert.deepEqual(selectionRegions(multi).map(region => region.page), [1, 2]);
  const remaining = cropsSelection(multi.crops.slice(1));
  assert.equal(remaining.page, 2);
  assert.equal(cropsSelection([]), null);
  const text = { kind: 'text', page: 1, text: 'A new highlight', rects: [rect] };
  assert.equal(appendCrop(multi, text), text);
  assert.equal(appendCrop(text, single).crops.length, 1);
});

test('crop limits reject an extra or oversized crop while preserving the selection', () => {
  const full = cropsSelection(Array.from({ length: MAX_CROPS }, () => ({ page: 1, rect, image })));
  assert.throws(() => appendCrop(full, single), /up to 10/);
  assert.equal(full.crops.length, MAX_CROPS);
  assert.throws(() => appendCrop(null, { ...single, image: image + 'a'.repeat(MAX_CROP_IMAGE_LENGTH) }), /too large/);
  const big = { page: 1, rect, image: 'a'.repeat(MAX_CROP_IMAGE_LENGTH) };
  assert.throws(() => appendCrop(cropsSelection(Array(4).fill(big)), single), /too large together/);
});

test('all crops reach one API request in order with page labels and a single full PDF', async () => {
  let calls = 0;
  const response = await askHandler(request(body), async (_url, options) => {
    calls++;
    const sent = JSON.parse(options.body), content = sent.input[0].content;
    assert.deepEqual(content.filter(item => item.type === 'input_image').map(item => item.image_url), [image, image]);
    assert.equal(content.filter(item => item.type === 'input_file').length, 1);
    assert.equal(content[0].file_data, pdf.data);
    assert.match(content[2].text, /Crop 1 of 2.*PDF page 1/);
    assert.match(content[4].text, /Crop 2 of 2.*PDF page 2/);
    assert.equal(sent.store, false);
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Both figures compared.' }] }] });
  });
  assert.equal(calls, 1);
  assert.equal((await response.json()).answer, 'Both figures compared.');
});

test('malformed collections, external URLs, missing images, too many crops, and combined size never call OpenAI', async () => {
  const oversizedImage = 'data:image/png;base64,' + 'a'.repeat(MAX_CROP_IMAGE_LENGTH - 21);
  const invalid = [[], Array(11).fill(body.crops[0]), [{ page: 0, image }], [{ page: 1.5, image }], [{ page: 1, image: 'https://example.com/track.png' }], [{ page: 1 }], [{ page: 1, image: image + 'a'.repeat(MAX_CROP_IMAGE_LENGTH) }], Array(5).fill({ page: 1, image: oversizedImage })];
  for (const crops of invalid) {
    const response = await askHandler(request({ ...body, crops }), async () => assert.fail('Invalid crops reached OpenAI'));
    assert.equal(response.status, 400);
  }
  assert.equal(questionSchema.safeParse({ ...body, image }).success, false);
  assert.equal(questionSchema.safeParse({ ...body, scope: 'paper' }).success, false);
});

test('request limit allows the largest supported collection and PDF with escaped question text', () => {
  const raw = Buffer.alloc(49_999_999); raw.write('%PDF-1.7');
  const image = 'data:image/png;base64,' + 'a'.repeat(4_999_976);
  const input = { ...body, question: '\u0001'.repeat(4000), text: '\u0001'.repeat(30000), pdf: { ...pdf, data: 'data:application/pdf;base64,' + raw.toString('base64') }, crops: Array(4).fill({ page: 1, image }) };
  assert.equal(questionSchema.safeParse(input).success, true);
  assert.ok(input.crops.reduce((sum, crop) => sum + crop.image.length, 0) <= MAX_CROP_TOTAL_LENGTH);
  assert.ok(Buffer.byteLength(JSON.stringify(input)) <= MAX_REQUEST_BYTES);
});

test('notes retain every crop location on rotated pages, export on both pages, and do not duplicate on re-export', async () => {
  const source = await PDFDocument.load(paper.bytes);
  source.getPage(1).setRotation(degrees(90));
  source.getPage(1).setCropBox(20, 30, 500, 700);
  const bytes = await exportPdf({ ...paper, bytes: await source.save() });
  const restored = await importNotes(bytes);
  assert.deepEqual(restored[0].selection.crops, multi.crops.map(({ page, rect }) => ({ page, rect })));
  assert.equal(selectionCrops(restored[0].selection).length, 2);
  for (const data of [bytes, await exportPdf({ ...paper, bytes, notes: restored })]) {
    const doc = await PDFDocument.load(data);
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      assert.equal(annots.size(), 3);
      assert.equal(annots.lookup(0).get(PDFName.of('Subtype')).toString(), '/Square');
      assert.equal(annots.lookup(1).get(PDFName.of('Subtype')).toString(), '/Text');
    }
  }
});

test('bundles preserve images and locations in JSON, HTML, chats, and notes; reject absent crop pages', async () => {
  const chat = { id: 'multi-chat', paperId: paper.id, selection: multi, question: note.question, answer: note.answer, status: 'completed', model: 'gpt-4.1-mini', createdAt: date };
  const bytes = await exportBundle(paper, [chat]);
  const result = await importBundle(bytes);
  assert.deepEqual(result.chats[0].selection.crops, multi.crops);
  assert.equal(result.paper.notes[0].selection.crops.length, 2);
  const files = unzipSync(bytes), html = strFromU8(files['chat-history.html']);
  assert.equal((html.match(/<img /g) ?? []).length, 2);
  assert.match(html, /Crop 2 · PDF page 2/);
  const history = JSON.parse(strFromU8(files['chat-history.json']));
  history.chats[0].selection.page = 999;
  await assert.rejects(importBundle(zipSync({ ...files, 'chat-history.json': strToU8(JSON.stringify(history)) })), /missing/);
  history.chats[0].selection.page = 1;
  history.chats[0].selection.crops[1].page = 999;
  await assert.rejects(importBundle(zipSync({ ...files, 'chat-history.json': strToU8(JSON.stringify(history)) })), /missing/);
});
