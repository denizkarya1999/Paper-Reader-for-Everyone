const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createFocusStore, reminderDelay } = require('./focus-settings.cjs');

function createFocusCat({ app, BrowserWindow, ipcMain, screen, powerMonitor, trusted, getMainWindow, cancelRequest, stopSpeech = () => {} }) {
  const store = createFocusStore(app.getPath('userData'));
  const entry = 'paper://reader/cat.html';
  let cat, timer, walking, token = null, message = null, direction = 1, context = null, stopped = false, suspended = false, hovering = false;
  const toReader = (channel, value) => getMainWindow()?.webContents.send(channel, value);
  const catTrusted = event => cat && event.sender === cat.webContents && event.senderFrame === cat.webContents.mainFrame && event.senderFrame.url === entry;
  function state() { return { settings: store.get(), message, direction }; }
  function send() { if (cat && !cat.isDestroyed()) cat.webContents.send('cat:state', state()); }
  function bounds() {
    if (!cat) return;
    const current = cat.getBounds(); const area = screen.getDisplayMatching(current).workArea;
    const width = Math.min(message ? 340 : 148, area.width), height = Math.min(message ? 390 : 125, area.height);
    cat.setBounds({ x: Math.max(area.x, Math.min(current.x, area.x + area.width - width)), y: area.y + area.height - height, width, height });
  }
  function cancel() {
    if (token) { cancelRequest('cat-' + token); toReader('reader:focus-cancel', token); }
    token = null;
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    const delay = reminderDelay(store.get());
    if (!stopped && !suspended && delay !== null && !message) timer = setTimeout(remind, delay);
  }
  function dismiss() { stopSpeech(); cancel(); message = null; bounds(); send(); schedule(); }
  function remind() {
    if (!cat || !store.get().enabled || message || suspended) return;
    clearTimeout(timer);
    message = { question: 'Did you understand what they say? Try explaining the last idea in your own words.' };
    if (store.get().quizzes && context) {
      token = randomUUID(); message = { question: 'Let me find a little question in your paper…', loading: true };
      toReader('reader:focus-reminder', token);
    } else if (store.get().quizzes) message = { question: 'Open a PDF in Paper Reader and I can quiz you on it. For now, take one small step back toward your reading.' };
    bounds(); send(); cat.showInactive();
  }
  function apply() {
    stopSpeech(); cancel(); message = null; clearTimeout(timer); clearInterval(walking);
    if (!store.get().enabled || stopped) { if (cat) { cat.destroy(); cat = null; } return; }
    if (!cat) {
      const area = screen.getDisplayMatching(getMainWindow().getBounds()).workArea;
      cat = new BrowserWindow({ x: area.x + 24, y: area.y + area.height - 125, width: 148, height: 125, frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, title: 'Paper Reader focus cat', webPreferences: { preload: path.join(__dirname, 'focus-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      cat.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
      cat.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      cat.webContents.on('will-navigate', event => event.preventDefault());
      cat.on('closed', () => { cat = null; clearInterval(walking); clearTimeout(timer); cancel(); });
      void cat.loadURL(entry);
    }
    bounds(); send();
    walking = setInterval(() => {
      if (!cat || message || suspended || hovering) return;
      const current = cat.getBounds(); const area = screen.getDisplayMatching(current).workArea;
      if (current.x + direction * 2 < area.x || current.x + direction * 2 + current.width > area.x + area.width) { direction *= -1; send(); }
      cat.setPosition(Math.max(area.x, Math.min(area.x + area.width - current.width, current.x + direction * 2)), area.y + area.height - current.height);
    }, 80);
    schedule();
  }
  ipcMain.handle('reader:focus-get', event => { if (!trusted(event)) throw new Error('Untrusted request.'); return store.get(); });
  ipcMain.handle('reader:focus-save', async (event, value) => { if (!trusted(event)) throw new Error('Untrusted request.'); const saved = await store.save(value); apply(); return saved; });
  ipcMain.on('reader:focus-context', (event, id) => { if (trusted(event) && (id === null || typeof id === 'string' && id.length <= 100) && id !== context) { context = id; dismiss(); } });
  ipcMain.handle('reader:focus-reply', (event, value) => {
    if (!trusted(event) || !value || value.token !== token || !token || !cat || !store.get().enabled) return false;
    for (const key of ['question', 'answer', 'error', 'source']) if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > (key === 'source' ? 255 : 4000))) return false;
    message = value.error ? { question: 'A small pause: did you understand the last idea?', error: value.error } : { question: value.question, answer: value.answer, source: value.source };
    token = null; send(); return true;
  });
  ipcMain.on('cat:ready', event => { if (catTrusted(event)) { send(); cat.showInactive(); } });
  ipcMain.on('cat:action', (event, action) => {
    if (!catTrusted(event)) return;
    if (action === 'pause') hovering = true;
    else if (action === 'walk') hovering = false;
    else if (action === 'dismiss') dismiss();
    else if (action === 'remind') remind();
    else if (action === 'reader') { const main = getMainWindow(); if (main) { main.restore(); main.show(); main.focus(); } }
    else if (action === 'disable') void store.save({ ...store.get(), enabled: false }).then(apply).catch(() => { message = { question: 'Could not save that change. Turn off Show my cat in Paper Reader’s Focus cat settings.' }; send(); });
  });
  screen.on('display-metrics-changed', bounds); screen.on('display-removed', bounds);
  powerMonitor.on('suspend', () => { suspended = true; dismiss(); if (cat) cat.hide(); });
  powerMonitor.on('resume', () => { suspended = false; if (cat) cat.showInactive(); schedule(); });
  return { isTrusted: catTrusted, getWindow: () => cat, async start() { await store.load(); apply(); }, stop() { stopSpeech(); stopped = true; clearTimeout(timer); clearInterval(walking); cancel(); if (cat) { cat.destroy(); cat = null; } } };
}
module.exports = { createFocusCat };
