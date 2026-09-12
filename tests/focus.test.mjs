import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFocusStore, DEFAULT_FOCUS, reminderDelay } from '../electron/focus-settings.cjs';
import { createFocusCat } from '../electron/focus-cat.cjs';

test('cat preferences persist, accept Never, and reject invalid reminder intervals', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cat-settings-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createFocusStore(directory); assert.deepEqual(await store.load(), DEFAULT_FOCUS);
  const desired = { enabled: true, name: 'Pati', color: 'gray', minutes: null, quizzes: true };
  await store.save(desired); assert.deepEqual(await createFocusStore(directory).load(), desired);
  assert.equal((await stat(path.join(directory, 'focus-cat.json'))).mode & 0o777, 0o600);
  assert.equal(reminderDelay(desired), null); assert.equal(reminderDelay({ ...desired, minutes: 7 }), 420000);
  assert.equal(reminderDelay({ ...desired, enabled: false, minutes: 1 }), null);
  for (const minutes of [0, -1, .5, NaN, 10081, '5']) assert.throws(() => store.save({ ...desired, minutes }), /Invalid/);
  assert.deepEqual(store.get(), desired);
});
test('desktop cat timer, Never, cancellation, stale replies and disabling control all quiz requests', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cat-controller-')); t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const ipc = new EventEmitter(); const handlers = new Map(); ipc.handle = (channel, fn) => handlers.set(channel, fn);
  const sent = [], windows = [], cancelled = [];
  const reader = {}; const main = { getBounds: () => ({ x: 100, y: 100, width: 1000, height: 700 }), webContents: { send: (...args) => sent.push(args) } };
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.box = options; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: 'paper://reader/cat.html' }; this.webContents.send = (channel, value) => { this.state = value; }; this.webContents.setWindowOpenHandler = () => {}; windows.push(this); }
    getBounds() { return this.box; } setBounds(value) { this.box = value; } setPosition(x, y) { this.box = { ...this.box, x, y }; }
    setVisibleOnAllWorkspaces() {} loadURL() {} showInactive() {} hide() {} isDestroyed() { return !!this.dead; } destroy() { this.dead = true; this.emit('closed'); }
  }
  const screen = new EventEmitter(); screen.getDisplayMatching = () => ({ workArea: { x: 0, y: 0, width: 1200, height: 900 } });
  const powerMonitor = new EventEmitter();
  const controller = createFocusCat({ app: { getPath: () => directory }, BrowserWindow: Window, ipcMain: ipc, screen, powerMonitor, trusted: e => e === reader, getMainWindow: () => main, cancelRequest: id => cancelled.push(id) });
  t.after(() => controller.stop()); await controller.start(); assert.equal(windows.length, 0);
  const save = value => handlers.get('reader:focus-save')(reader, value);
  await save({ ...DEFAULT_FOCUS, enabled: true, minutes: 1, quizzes: true });
  const cat = windows[0]; const event = { sender: cat.webContents, senderFrame: cat.webContents.mainFrame };
  ipc.emit('reader:focus-context', reader, 'pdf-one');
  const initialX = cat.getBounds().x; t.mock.timers.tick(800); assert.notEqual(cat.getBounds().x, initialX);
  t.mock.timers.tick(59200);
  const token = sent.find(item => item[0] === 'reader:focus-reminder')[1];
  assert.equal(cat.state.message.loading, true);
  assert.equal(handlers.get('reader:focus-reply')(reader, { token: 'wrong', question: 'Bad' }), false);
  assert.equal(handlers.get('reader:focus-reply')(reader, { token, question: 'What does X do?', answer: 'It senses Y.' }), true);
  t.mock.timers.tick(180000); assert.equal(sent.filter(item => item[0] === 'reader:focus-reminder').length, 1);
  ipc.emit('cat:action', event, 'dismiss'); t.mock.timers.tick(60000);
  const second = sent.filter(item => item[0] === 'reader:focus-reminder')[1][1];
  await save({ ...DEFAULT_FOCUS, enabled: false, minutes: 1, quizzes: true });
  assert.ok(cancelled.includes('cat-' + second)); assert.equal(cat.isDestroyed(), true);
  assert.equal(handlers.get('reader:focus-reply')(reader, { token: second, question: 'Late' }), false);
  t.mock.timers.tick(120000); assert.equal(sent.filter(item => item[0] === 'reader:focus-reminder').length, 2);
  await save({ ...DEFAULT_FOCUS, enabled: true, minutes: null, quizzes: true });
  t.mock.timers.tick(300000); assert.equal(sent.filter(item => item[0] === 'reader:focus-reminder').length, 2);
  await save({ ...DEFAULT_FOCUS, enabled: true, minutes: 1, quizzes: true });
  powerMonitor.emit('suspend'); t.mock.timers.tick(300000); assert.equal(sent.filter(item => item[0] === 'reader:focus-reminder').length, 2);
  powerMonitor.emit('resume'); t.mock.timers.tick(59999); assert.equal(sent.filter(item => item[0] === 'reader:focus-reminder').length, 2);
  t.mock.timers.tick(1); assert.equal(sent.filter(item => item[0] === 'reader:focus-reminder').length, 3);
  ipc.emit('reader:focus-context', reader, 'different-paper');
  assert.equal(windows.at(-1).state.message, null);
  assert.throws(() => handlers.get('reader:focus-get')({}), /Untrusted/);
});
