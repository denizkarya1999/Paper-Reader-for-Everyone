import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const directory = await mkdtemp(path.join(tmpdir(), 'reader-flashcards-'));
await build({ entryPoints: ['lib/flashcards.ts', 'lib/storage.ts', 'lib/paper-bundle.ts', 'lib/pdf-export.ts'], bundle: true, platform: 'node', format: 'esm', outdir: directory });
const { flashcardBatches, flashcardPrompt, parseFlashcards } = await import(pathToFileURL(path.join(directory, 'flashcards.js')));
const storage = await import(pathToFileURL(path.join(directory, 'storage.js')));
const { exportBundle, importBundle } = await import(pathToFileURL(path.join(directory, 'paper-bundle.js')));
const { examplePdf } = await import(pathToFileURL(path.join(directory, 'pdf-export.js')));
test.after(() => rm(directory, { recursive: true, force: true }));
const make = (count, offset = 0) => Array.from({ length: count }, (_, i) => ({ question: `Question ${i + offset + 1}?`, answer: `Answer ${i + offset + 1}.`, page: i % 2 + 1 }));

test('requested counts are produced exactly in bounded batches, with prior questions included', async () => {
  let calls = 0; const produced = [];
  for await (const cards of flashcardBatches({ count: 23, pages: 2, isActive: () => true, send: async question => {
    assert.ok(question.length <= 4000);
    if (calls > 0) assert.match(question, /Question 1\?/);
    const count = calls === 2 ? 3 : 10; const answer = JSON.stringify({ cards: make(count, calls * 10) }); calls++; return { answer };
  } })) produced.push(cards);
  assert.equal(calls, 3); assert.deepEqual(produced.map(cards => cards.length), [10, 20, 23]);
  assert.equal(new Set(produced[2].map(card => card.id)).size, 23);
});
test('invalid counts never contact the API; the largest supported set keeps prompts bounded', async () => {
  for (const count of [0, -1, 1.5, 51, NaN]) await assert.rejects(async () => {
    for await (const _ of flashcardBatches({ count, pages: 2, isActive: () => true, send: () => assert.fail('Must not call API') })) {}
  }, /1–50/);
  assert.ok(flashcardPrompt(10, make(50).map(card => ({ ...card, question: 'x'.repeat(500) }))).length < 4000);
});
test('model responses require the requested count, distinct questions, bounded text and existing PDF pages', () => {
  const valid = make(2); assert.equal(parseFlashcards('```json\n' + JSON.stringify({ cards: valid }) + '\n```', 2, 2).length, 2);
  for (const input of ['bad json', JSON.stringify({ error: 'unreadable' }), JSON.stringify({ cards: valid.slice(0, 1) })]) assert.throws(() => parseFlashcards(input, 2, 2), /flashcard/);
  assert.throws(() => parseFlashcards(JSON.stringify({ cards: [valid[0], { ...valid[0], question: ' QUESTION 1? ' }] }), 2, 2), /repeated/);
  assert.throws(() => parseFlashcards(JSON.stringify({ cards: valid }), 2, 2, [{ ...valid[0], id: 'old' }]), /repeated/);
  assert.throws(() => parseFlashcards(JSON.stringify({ cards: [{ ...valid[0], page: 3 }] }), 1, 2), /outside/);
  assert.throws(() => parseFlashcards(JSON.stringify({ cards: [{ ...valid[0], answer: 'a'.repeat(1501) }] }), 1, 2), /requested number/);
});
test('cancellation during a request discards the late batch and starts no further calls', async () => {
  let active = true; let calls = 0; const output = [];
  for await (const cards of flashcardBatches({ count: 20, pages: 2, isActive: () => active, send: async () => { calls++; active = false; return { answer: JSON.stringify({ cards: make(10) }) }; } })) output.push(cards);
  assert.equal(calls, 1); assert.equal(output.length, 0);
});
test('an error or incomplete response after a successful batch leaves earlier cards available', async () => {
  for (const failure of [{ error: 'API unavailable' }, { answer: 'partial', incomplete: true }]) {
    let calls = 0; const batches = flashcardBatches({ count: 15, pages: 2, isActive: () => true, send: async () => ++calls === 1 ? { answer: JSON.stringify({ cards: make(10) }) } : failure });
    const first = (await batches.next()).value; assert.equal(first.length, 10);
    await assert.rejects(batches.next()); assert.equal(first.length, 10); assert.equal(calls, 2);
  }
});
const date = '2026-09-12T23:00:00.000Z';
const paper = { id: 'flashcard-paper', name: 'Flashcard practice.pdf', bytes: await examplePdf(), page: 1, notes: [], updatedAt: date };
const cards = [{ id: 'one', question: 'Why start with the research question?', answer: 'It helps identify what the authors wanted to understand and why it matters.', page: 1 }, { id: 'two', question: 'Does a correlation establish cause?', answer: 'No. Consider other explanations and the evidence. Unicode: 日本語 ✓ <script>test</script>', page: 1 }];
const chat = { id: 'deck', paperId: paper.id, question: '[Flashcards] Generate 2 questions with answers.', answer: '2 of 2 flashcards saved. Open Flashcards to study this set.', model: 'gpt-6-astra', createdAt: date, status: 'completed', selection: { kind: 'paper', page: 1, text: '', rects: [{ x: .87, y: .05, width: .03, height: .03 }] }, flashcardCount: 2, flashcards: cards };
test('flashcards survive device persistence and ZIP restore, with complete escaped readable answers', async () => {
  await storage.savePaper(paper); await storage.addChat({ ...chat, status: 'pending', flashcards: [] });
  await storage.finishChat(paper.id, chat.id, { status: 'completed', flashcards: cards, answer: chat.answer });
  assert.deepEqual((await storage.listChats(paper.id))[0].flashcards, cards);
  const bytes = await exportBundle(paper, await storage.listChats(paper.id)); const restored = await importBundle(bytes);
  assert.deepEqual(restored.chats[0].flashcards, cards); assert.equal(restored.chats[0].flashcardCount, 2);
  const html = strFromU8(unzipSync(bytes)['chat-history.html']);
  assert.match(html, /Why start with the research question/); assert.match(html, /日本語 ✓ &lt;script&gt;test&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  if (process.env.PAPER_READER_FLASHCARD_FIXTURE) await writeFile(process.env.PAPER_READER_FLASHCARD_FIXTURE, bytes);
});
test('partial decks survive cancellation and recovery; deleting history prevents late progress from restoring them', async () => {
  const id = 'partial'; await storage.addChat({ ...chat, id, status: 'pending', flashcards: [], flashcardCount: 10 });
  await storage.finishChat(paper.id, id, { status: 'pending', flashcards: cards }); await storage.recoverInterruptedChats();
  const partial = (await storage.listChats(paper.id)).find(item => item.id === id);
  assert.equal(partial.status, 'interrupted'); assert.deepEqual(partial.flashcards, cards);
  assert.equal(await storage.finishChat(paper.id, id, { status: 'completed', flashcards: cards }), false);
  await storage.clearChats(paper.id);
  assert.equal(await storage.finishChat(paper.id, id, { status: 'completed', flashcards: cards }), false);
  assert.equal((await storage.listPapers()).length, 1);
});
