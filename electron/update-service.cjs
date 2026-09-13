const fs = require('node:fs/promises');
const path = require('node:path');
function createUpdateService({ updater, directory, version, enabled, broadcast, timers = globalThis }) {
  let state = { version, automatic: true, supported: enabled, status: 'idle', latest: null, percent: 0, checkedAt: null, error: null };
  let checking = null, startup = null, interval = null;
  const filename = path.join(directory, 'updates.json');
  const publish = patch => { state = { ...state, ...patch }; broadcast(state); return state; };
  const failure = () => publish({ status: state.status === 'installing' ? 'ready' : 'error', error: state.status === 'installing' ? 'The update was not installed. Approve the Linux administrator prompt and try again.' : 'Could not check or download the update. Check your internet connection and try again.' });
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('checking-for-update', () => publish({ status: 'checking', error: null }));
  updater.on('update-available', info => publish({ status: 'downloading', latest: info.version, percent: 0, checkedAt: new Date().toISOString() }));
  updater.on('download-progress', info => publish({ status: 'downloading', percent: Math.min(100, Math.max(0, Math.round(info.percent))) }));
  updater.on('update-not-available', () => publish({ status: 'current', latest: null, checkedAt: new Date().toISOString(), error: null }));
  updater.on('update-downloaded', info => publish({ status: 'ready', latest: info.version, percent: 100, error: null }));
  updater.on('error', failure);
  async function check() {
    if (!enabled || checking || ['checking', 'downloading', 'ready', 'installing'].includes(state.status)) return state;
    publish({ status: 'checking', error: null });
    checking = Promise.resolve().then(async () => {
      try { const result = await updater.checkForUpdates(); if (result?.downloadPromise) await result.downloadPromise; }
      catch { failure(); }
      finally { checking = null; }
    });
    await checking; return state;
  }
  function schedule() {
    if (startup) timers.clearTimeout(startup);
    if (interval) timers.clearInterval(interval);
    startup = interval = null;
    if (!enabled || !state.automatic) return;
    startup = timers.setTimeout(() => { void check(); }, 10000); startup?.unref?.();
    interval = timers.setInterval(() => { void check(); }, 4 * 60 * 60 * 1000); interval?.unref?.();
  }
  async function start() {
    try { const saved = JSON.parse(await fs.readFile(filename, 'utf8')); if (typeof saved.automatic === 'boolean') state.automatic = saved.automatic; } catch {}
    schedule(); return publish({});
  }
  async function setAutomatic(value) {
    if (typeof value !== 'boolean') throw new Error('Choose whether to check for updates automatically.');
    await fs.mkdir(directory, { recursive: true });
    const temporary = filename + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({ automatic: value }), { mode: 0o600 });
    await fs.rename(temporary, filename);
    publish({ automatic: value }); schedule(); return state;
  }
  function install() {
    if (!enabled || state.status !== 'ready') return state;
    publish({ status: 'installing', error: null });
    try { updater.quitAndInstall(false, true); } catch { failure(); }
    return state;
  }
  return { start, check, setAutomatic, install, state: () => state, stop: () => { if (startup) timers.clearTimeout(startup); if (interval) timers.clearInterval(interval); } };
}
module.exports = { createUpdateService };
