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
const { askHandler, questionSchema, MAX_REQUEST_BYTES } = await import(pathToFileURL(path.join(temporary, 'ask.js')));
test.after(() => rm(temporary, { recursive: true, force: true }));

const note = { id: 'fixture-note', selection: { page: 1, kind: 'text', text: 'A correlation is not proof of causation.', rects: [{ x: .1, y: .3, width: .6, height: .03 }] }, question: 'What does this mean?', answer: 'It does not establish cause. Türkçe: ilişki, neden değildir. 日本語 ✓', color: 'yellow', createdAt: '2026-09-12T12:00:00.000Z' };
const paper = async (notes = [note]) => ({ id: 'test', name: 'source.pdf', bytes: await examplePdf(), notes, page: 1, updatedAt: note.createdAt });
const request = (body, headers = {}) => new Request('https://paper-reader.local/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openai-key': 'sk-test-placeholder', ...headers }, body: JSON.stringify(body) });
const fullPdf = { filename: 'complete-paper.pdf', data: 'data:application/pdf;base64,' + Buffer.from(await examplePdf()).toString('base64') };
const body = { pdf: fullPdf, question: 'Explain this', text: 'Selected passage', page: 1, model: 'gpt-4.1-mini' };

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
test('selected text receives the entire PDF and instructions to connect it to other pages', async () => {
  let sent;
  const result = await askHandler(request(body), async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); sent = JSON.parse(options.body);
    return Response.json({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'A clear answer.' }] }] });
  });
  assert.equal((await result.json()).answer, 'A clear answer.');
  assert.equal(sent.store, false); assert.equal(sent.input[0].content[0].file_data, fullPdf.data);
  assert.match(sent.input[0].content[1].text, /Selected passage/);
  assert.match(sent.input[0].content[1].text, /Selected PDF page: 1/);
  assert.equal(sent.input[0].content.length, 2); assert.match(sent.instructions, /untrusted/);
  assert.match(sent.instructions, /using the whole paper as context/); assert.match(sent.instructions, /other supporting pages/);
  assert.doesNotMatch(sent.instructions, /only the supplied PDF selection|Do not claim to have read the full document/);
});
test('cropped-area request includes both the full PDF and the exact crop', async () => {
  const result = await askHandler(request({ ...body, text: '', image: 'data:image/png;base64,YWJj' }), async (_url, options) => {
    const value = JSON.parse(options.body); assert.equal(value.input[0].content[0].file_data, fullPdf.data);
    assert.equal(value.input[0].content[2].type, 'input_image'); assert.equal(value.input[0].content[2].image_url, 'data:image/png;base64,YWJj');
    assert.match(value.instructions, /cropped area, using the whole paper/);
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

test('all current model options support selection requests with compatible reasoning settings', async () => {
  for (const model of ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-4.1-mini', 'gpt-4.1']) {
    const result = await askHandler(request({ ...body, model }), async (_url, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, model);
      assert.equal(sent.store, false);
      if (model.startsWith('gpt-4.1')) assert.equal(sent.reasoning, undefined);
      else { assert.deepEqual(sent.reasoning, { effort: 'low' }); assert.ok(sent.max_output_tokens >= 8192); }
      for (const key of ['temperature', 'top_p', 'top_logprobs']) assert.equal(sent[key], undefined);
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer' }] }] });
    });
    assert.equal(result.status, 200);
  }
});
test('whole-paper questions send every PDF page, preserving images, without a persistent file upload', async () => {
  const bytes = await examplePdf();
  const pdf = { filename: 'complete-paper.pdf', data: 'data:application/pdf;base64,' + Buffer.from(bytes).toString('base64') };
  let calls = 0;
  const result = await askHandler(request({ scope: 'paper', question: 'Summarize the whole paper', model: 'gpt-6-astra', pdf }), async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const sent = JSON.parse(options.body); assert.equal(sent.store, false);
    assert.equal(sent.input[0].content[0].type, 'input_file');
    assert.equal(sent.input[0].content[0].filename, pdf.filename);
    const decoded = Buffer.from(sent.input[0].content[0].file_data.split(',')[1], 'base64');
    assert.deepEqual(new Uint8Array(decoded), bytes);
    assert.equal((await PDFDocument.load(decoded)).getPageCount(), 2);
    assert.match(sent.instructions, /Read all pages/); assert.match(sent.instructions, /untrusted/);
    assert.doesNotMatch(sent.instructions, /Do not claim to have read the full document/);
    assert.equal(sent.max_output_tokens, 16384);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Summary with PDF page 2 reference.' }] }] });
  });
  assert.equal(calls, 1); assert.match((await result.json()).answer, /page 2/);
});
test('whole-paper notes survive export, edits, and deletion without adding a false highlight', async () => {
  const summary = { ...note, selection: { page: 1, kind: 'paper', text: '', rects: [{ x: .87, y: .05, width: .03, height: .03 }] }, answer: 'Whole-paper summary — 方法と結果。', question: 'Summarize the paper.' };
  const source = await paper([summary]);
  const saved = await exportPdf(source);
  assert.deepEqual(await importNotes(saved), [summary]);
  const doc = await PDFDocument.load(saved);
  const annots = doc.getPage(0).node.Annots();
  assert.equal(annots.size(), 2);
  assert.equal(annots.lookup(0).get(PDFName.of('Subtype')).toString(), '/Text');
  assert.equal(annots.lookup(0).get(PDFName.of('Subj')).decodeText(), 'Whole-paper note');
  const revised = { ...summary, answer: 'Updated summary' };
  const resaved = await exportPdf({ ...source, bytes: saved, notes: [revised] });
  assert.deepEqual(await importNotes(resaved), [revised]);
  assert.equal((await PDFDocument.load(resaved)).getPage(0).node.Annots().size(), 2);
  const deleted = await exportPdf({ ...source, bytes: resaved, notes: [] });
  assert.deepEqual(await importNotes(deleted), []);
});
test('missing or invalid full PDFs and mixed question scopes never reach OpenAI', async () => {
  const fetcher = () => assert.fail('Must not contact OpenAI');
  const pdf = { filename: 'paper.pdf', data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\n%%EOF').toString('base64') };
  const whole = { scope: 'paper', question: 'Summarize', model: 'gpt-6-astra', pdf };
  for (const invalid of [
    { ...whole, pdf: undefined },
    { ...whole, pdf: { ...pdf, data: 'https://example.com/private.pdf' } },
    { ...whole, pdf: { ...pdf, data: 'data:application/pdf;base64,YWJj' } },
    { ...whole, pdf: { ...pdf, filename: 'paper.txt' } },
    { ...whole, pdf: { ...pdf, data: pdf.data + '===' } },
    { ...body, scope: 'selection', pdf: undefined },
    { ...body, pdf: { ...pdf, data: 'https://example.com/private.pdf' } },
    { ...whole, text: 'Hidden selection' },
  ]) assert.equal((await askHandler(request(invalid), fetcher)).status, 400);
});
test('oversized PDF bodies are rejected before contacting OpenAI', async () => {
  const large = new Request('https://paper-reader.local/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openai-key': 'sk-test-placeholder' }, body: 'x'.repeat(MAX_REQUEST_BYTES + 1) });
  const result = await askHandler(large, () => assert.fail('Must not contact OpenAI'));
  assert.equal(result.status, 413);
});
test('truncated, overlong, and context-limit responses remain explicit and notes stay exportable', async () => {
  const incomplete = await askHandler(request(body), async () => Response.json({ status: 'incomplete', output: [{ type: 'reasoning' }] }));
  assert.match((await incomplete.json()).error, /response limit/);
  const long = await askHandler(request(body), async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'a'.repeat(21000) }] }] }));
  const value = await long.json(); assert.equal(value.incomplete, true); assert.equal(value.answer.length, 19900);
  const context = await askHandler(request(body), async () => Response.json({ error: { code: 'context_length_exceeded', message: 'secret' } }, { status: 400 }));
  assert.match((await context.json()).error, /reading limit/);
});
test('cancellation reaches the OpenAI request and is reported as cancelled', async () => {
  const controller = new AbortController();
  const input = new Request(request(body), { signal: controller.signal });
  const result = await askHandler(input, async (_url, options) => {
    controller.abort(); assert.equal(options.signal.aborted, true); throw new Error('aborted');
  });
  assert.match((await result.json()).error, /cancelled/);
});


test('general paper questions need no selection and preserve the user question', async () => {
  const question = 'How do the methods support the main findings?';
  const result = await askHandler(request({ scope: 'paper', question, model: 'gpt-6-astra', pdf: fullPdf }), async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.equal(sent.input[0].content.length, 2);
    assert.equal(sent.input[0].content[0].file_data, fullPdf.data);
    assert.equal(sent.input[0].content[1].text, question);
    assert.match(sent.instructions, /Answer the user question using the whole paper/);
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'The methods support the findings on PDF page 2.' }] }] });
  });
  assert.match((await result.json()).answer, /PDF page 2/);
});

test('request allowance fits a maximum PDF, crop and escaped question without truncating context', () => {
  const raw = Buffer.alloc(49_999_999); raw.write('%PDF-1.7');
  const input = { ...body, pdf: { filename: 'large.pdf', data: 'data:application/pdf;base64,' + raw.toString('base64') }, image: 'data:image/png;base64,' + 'a'.repeat(4_999_976), text: '\u0001'.repeat(30_000), question: '\u0001'.repeat(4000) };
  assert.equal(questionSchema.safeParse(input).success, true);
  assert.ok(Buffer.byteLength(JSON.stringify(input)) <= MAX_REQUEST_BYTES);
  assert.equal(questionSchema.safeParse({ ...input, image: input.image + 'aaaa' }).success, false);
});
