import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechService, speechChunks, CHUNK_SIZE } from '../electron/speech.cjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const audio = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });
function fixture(fetcher = async () => audio(), getKey = () => 'sk-test-placeholder') {
  const states = [];
  return { states, service: createSpeechService({ getKey, fetcher, broadcast: state => states.push(state) }) };
}
test('speech reads the complete answer in bounded chunks, preserving Unicode', () => {
  const text = ('A long answer with a sentence. 😀 Another line!\n').repeat(400);
  const chunks = speechChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= CHUNK_SIZE && !/[\uD800-\uDBFF]$/.test(chunk)));
});
test('speech only sends requested text, with an American AI voice and a main-process key', async () => {
  const sent = [];
  const { service } = fixture(async (url, options) => { sent.push({ url, ...options }); return audio(); });
  const text = 'An answer. '.repeat(220);
  const state = service.start(7, { id: 'answer-1', text });
  assert.equal(state.status, 'loading'); assert.equal(sent.length, 0);
  assert.equal(await service.next(8, 'answer-1'), null);
  for (let i = 0; i < state.total; i++) {
    assert.match((await service.next(7, 'answer-1')).audio, /^data:audio\/mpeg;base64,/);
    service.phase(7, { id: 'answer-1', status: 'playing' });
    assert.equal(service.pause().status, 'paused'); assert.equal(service.pause().status, 'playing');
  }
  assert.equal(await service.next(7, 'answer-1'), null); assert.equal(service.state().status, 'idle');
  assert.equal(sent.map(call => JSON.parse(call.body).input).join(''), text.trim());
  for (const call of sent) {
    assert.equal(call.url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(call.headers.Authorization, 'Bearer sk-test-placeholder');
    const body = JSON.parse(call.body);
    assert.equal(body.model, 'gpt-4o-mini-tts'); assert.equal(body.voice, 'marin');
    assert.match(body.instructions, /American English/); assert.equal(body.pdf, undefined);
  }
});
test('switching answers cancels in-flight speech and ignores late audio and wrong owners', async () => {
  let finish, signal;
  const { service } = fixture(async (_url, options) => { signal = options.signal; await new Promise(resolve => { finish = resolve; }); return audio(); });
  service.start(1, { id: 'first', text: 'First.' });
  const pending = service.next(1, 'first');
  assert.equal(await service.next(1, 'first'), null);
  service.start(2, { id: 'second', text: 'Second.' });
  assert.equal(signal.aborted, true); finish(); assert.equal(await pending, null);
  service.phase(1, { id: 'first', status: 'error' }); service.stopOwner(1);
  assert.equal(service.state().id, 'second'); service.stopOwner(2); assert.equal(service.state().status, 'idle');
});
test('speech reports missing keys, usage errors, invalid audio and oversized text without leaking server details', async () => {
  const missing = fixture(async () => assert.fail('No key must not call API'), () => null).service;
  assert.equal(missing.start(1, { id: 'x', text: 'Hi' }).status, 'error');
  for (const response of [() => new Response('sensitive upstream detail', { status: 429 }), () => new Response('not audio'), () => new Response('', { headers: { 'content-type': 'audio/mpeg' } })]) {
    const { service } = fixture(async () => response()); service.start(1, { id: 'x', text: 'Hi' });
    assert.equal(await service.next(1, 'x'), null); assert.equal(service.state().status, 'error');
    assert.doesNotMatch(service.state().error, /sensitive|sk-test/);
  }
  assert.throws(() => missing.start(1, { id: 'x', text: 'x'.repeat(20001) }), /20,000/);
});
test('shared playback supports pause/resume, finishes all chunks, and stops when another window starts speech', async () => {
  let update, fetched = 0;
  const audios = [];
  const { service } = fixture();
  const bridge = {
    start: async value => { const state = service.start(1, value); update(state); return state; },
    next: async id => { fetched++; const result = await service.next(1, id); update(service.state()); return result; },
    getState: async () => service.state(), onState: callback => { update = callback; },
    phase: value => { service.phase(1, value); update(service.state()); },
    stop: async id => { service.stop(id); update(service.state()); },
    pause: async () => update(service.pause()),
  };
  class Audio {
    paused = true; constructor(src) { this.src = src; audios.push(this); }
    async play() { this.paused = false; } pause() { this.paused = true; } removeAttribute() {} load() {}
  }
  const window = { paperSpeech: bridge, addEventListener() {} };
  vm.runInNewContext(await readFile('public/speech.js', 'utf8'), { window, Audio });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await tick(); await window.readerSpeech.start('a', 'text '.repeat(500)); await tick();
  assert.equal(audios.length, 1); assert.equal(window.readerSpeech.getState().status, 'playing');
  window.readerSpeech.pause(); assert.equal(audios[0].paused, true);
  window.readerSpeech.pause(); assert.equal(audios[0].paused, false);
  audios[0].onended(); await tick(); assert.equal(audios.length, 2);
  audios[1].onended(); await tick(); assert.equal(window.readerSpeech.getState().status, 'idle');
  assert.equal(fetched, 3);
  await window.readerSpeech.start('b', 'Another answer.'); await tick();
  update({ id: 'cat', status: 'loading', part: 1, total: 1 });
  assert.equal(audios.at(-1).paused, true); assert.equal(audios.at(-1).onended, null);
});
