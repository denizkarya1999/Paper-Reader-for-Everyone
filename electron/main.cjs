const { app, BrowserWindow, dialog, ipcMain, shell, session, Menu, protocol, net, safeStorage, screen, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { askHandler, MAX_REQUEST_BYTES, DEFAULT_MODEL, MODEL_IDS } = require('../dist/ask.cjs');
const { createConnectionStore } = require('./connection-store.cjs');

app.setName('Paper Reader for Everyone');
// Chromium does not automatically select a secret store on LXQt/LXDE.
if (process.platform === 'linux' && /(?:^|:)(?:LXQt|LXDE)(?::|$)/i.test(process.env.XDG_CURRENT_DESKTOP || '') && !app.commandLine.hasSwitch('password-store')) {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}
// A fixed app-data location keeps the library stable across upgrades.
if (process.env.PAPER_READER_TEST_DATA) app.setPath('userData', process.env.PAPER_READER_TEST_DATA);
else app.setPath('userData', path.join(app.getPath('appData'), 'paper-reader-for-everyone'));
const connection = createConnectionStore({ directory: app.getPath('userData'), safeStorage, models: MODEL_IDS, defaultModel: DEFAULT_MODEL });
const entry = 'paper://reader/index.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'paper', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const active = new Map();
let mainWindow;
let focusCat;
const trusted = event => event.sender === mainWindow?.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === entry;
const assertTrusted = event => { if (!trusted(event)) throw new Error('Untrusted app request.'); };

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    await connection.load();
    const publicRoot = path.resolve(__dirname, '../dist');
    protocol.handle('paper', request => {
      try {
        const url = new URL(request.url);
        const target = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
        if (url.host !== 'reader' || !target.startsWith(publicRoot + path.sep) || !/\.(?:html|js|mjs|css|png|svg|pfb|ttf|bcmap|wasm)$/i.test(target)) return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(target).href);
      } catch { return new Response('Not found', { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    mainWindow = new BrowserWindow({ width: 1280, height: 880, minWidth: 720, minHeight: 550, title: 'Paper Reader for Everyone', backgroundColor: '#f6f7fa', show: false, icon: path.join(__dirname, '../dist/icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    Menu.setApplicationMenu(null);
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url === 'https://platform.openai.com/api-keys') void shell.openExternal(url); return { action: 'deny' }; });
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.on('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { focusCat?.stop(); for (const controller of active.values()) controller.abort(); active.clear(); mainWindow = null; });
    focusCat = require('./focus-cat.cjs').createFocusCat({ app, BrowserWindow, ipcMain, screen, powerMonitor, trusted, getMainWindow: () => mainWindow, cancelRequest: id => active.get(id)?.abort() });
    mainWindow.webContents.once('did-finish-load', () => { void focusCat.start(); });
    void mainWindow.loadURL(entry);
  });
}
app.on('window-all-closed', () => app.quit());

ipcMain.handle('reader:open', async event => {
  assertTrusted(event);
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Open a PDF or saved bundle', properties: ['openFile'], filters: [{ name: 'PDF documents and saved bundles', extensions: ['pdf', 'zip'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const filename = result.filePaths[0]; const stat = await fs.stat(filename);
  const limit = filename.toLowerCase().endsWith('.zip') ? 200_000_000 : 50 * 1024 * 1024;
  if (!stat.isFile() || stat.size > limit) throw new Error('Choose a PDF below 50 MB or a saved ZIP bundle below 200 MB.');
  const bytes = await fs.readFile(filename);
  return { name: path.basename(filename), bytes: new Uint8Array(bytes) };
});
ipcMain.handle('reader:save', async (event, value) => {
  assertTrusted(event);
  if (!value || typeof value.name !== 'string' || !(value.bytes instanceof Uint8Array) || value.bytes.length > 150 * 1024 * 1024 || Buffer.from(value.bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('Invalid PDF export.');
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Save annotated PDF', defaultPath: path.basename(value.name).slice(0, 220), filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
  if (result.canceled || !result.filePath) return false;
  const filename = result.filePath.toLowerCase().endsWith('.pdf') ? result.filePath : `${result.filePath}.pdf`;
  // Write completely before replacing the chosen destination.
  const temporary = `${filename}.${require('node:crypto').randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, value.bytes, { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); }
  finally { await fs.unlink(temporary).catch(() => {}); }
  return true;
});
ipcMain.handle('reader:ask', async (event, value) => {
  assertTrusted(event);
  if (!value || typeof value.id !== 'string' || value.id.length > 100) return { error: 'Invalid question.' };
  const apiKey = connection.getKey();
  if (!apiKey) return { error: 'Add your OpenAI API key in Connection first.' };
  if ((typeof value.pdf?.data === 'string' && value.pdf.data.length > MAX_REQUEST_BYTES) || (typeof value.image === 'string' && value.image.length > 5_000_000) || (typeof value.text === 'string' && value.text.length > 30000)) return { error: 'The PDF or selection is too large.' };
  if (active.size) return { error: 'Wait for your current answer or cancel it first.' };
  const controller = new AbortController(); active.set(value.id, controller);
  try {
    const { id, ...body } = value;
    const request = new Request('https://paper-reader.local/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openai-key': apiKey }, body: JSON.stringify(body), signal: controller.signal });
    const response = await askHandler(request); return await response.json();
  } catch { return { error: 'The question could not be sent. Please try again.' }; }
  finally { active.delete(value.id); }
});
ipcMain.on('reader:cancel', (event, id) => { if (trusted(event) && typeof id === 'string') active.get(id)?.abort(); });
ipcMain.handle('reader:connection', event => { assertTrusted(event); return connection.state(); });
ipcMain.handle('reader:connection-save', async (event, value) => {
  assertTrusted(event);
  try { return await connection.save(value); }
  catch (e) { return { ...connection.state(), error: e.code ? 'Could not save the connection on this device.' : e.message }; }
});
ipcMain.handle('reader:connection-clear', async event => {
  assertTrusted(event);
  try { return await connection.clear(); }
  catch { return { ...connection.state(), error: 'Could not remove the saved key. Please try again.' }; }
});
ipcMain.handle('reader:save-bundle', async (event, value) => {
  assertTrusted(event);
  if (!value || typeof value.name !== 'string' || !(value.bytes instanceof Uint8Array) || value.bytes.length > 200_000_000 || value.bytes[0] !== 80 || value.bytes[1] !== 75 || value.bytes[2] !== 3 || value.bytes[3] !== 4) throw new Error('Invalid PDF and chat bundle.');
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Save PDF + chats', defaultPath: path.basename(value.name).slice(0, 220), filters: [{ name: 'PDF and chat history ZIP', extensions: ['zip'] }] });
  if (result.canceled || !result.filePath) return false;
  const filename = result.filePath.toLowerCase().endsWith('.zip') ? result.filePath : result.filePath + '.zip';
  const temporary = filename + '.' + require('node:crypto').randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, value.bytes, { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); }
  finally { await fs.unlink(temporary).catch(() => {}); }
  return true;
});
