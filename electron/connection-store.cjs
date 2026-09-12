const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createConnectionStore({ directory, safeStorage, models, defaultModel, platform = process.platform }) {
  const filename = path.join(directory, 'connection.json');
  let apiKey = '', model = defaultModel, saved = false, error = '', queue = Promise.resolve();
  const validKey = key => typeof key === 'string' && key.length <= 512 && /^sk-[A-Za-z0-9_-]+$/.test(key);
  const canRemember = () => {
    try {
      return safeStorage.isEncryptionAvailable() && (platform !== 'linux' || ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(safeStorage.getSelectedStorageBackend()));
    } catch { return false; }
  };
  const state = () => ({ hasKey: !!apiKey, saved, model, canRemember: canRemember(), ...(error ? { error } : {}) });
  const serial = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  async function write(value) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try { await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); }
    finally { await fs.unlink(temporary).catch(() => {}); }
  }
  return {
    state,
    getKey: () => apiKey,
    load: () => serial(async () => {
      try {
        const stat = await fs.stat(filename);
        if (stat.size > 10000) throw new Error('Invalid settings');
        const value = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (value.version !== 1) throw new Error('Unsupported settings');
        if (models.includes(value.model)) model = value.model;
        saved = typeof value.encryptedKey === 'string' && !!value.encryptedKey;
        if (saved) {
          if (!canRemember()) { error = 'Unlock your Linux keyring and restart to use the saved key, or enter a key for this session.'; return state(); }
          // Electron 41 provides the synchronous safeStorage API.
          const decrypted = safeStorage.decryptString(Buffer.from(value.encryptedKey, 'base64'));
          if (!validKey(decrypted)) throw new Error('Invalid saved key');
          apiKey = decrypted;
        }
      } catch (e) {
        if (e.code !== 'ENOENT') { saved = true; error = 'The saved connection could not be unlocked. Enter a replacement key or remove the saved key.'; }
      }
      return state();
    }),
    save: value => serial(async () => {
      if (!value || !models.includes(value.model) || typeof value.remember !== 'boolean' || (value.apiKey !== undefined && typeof value.apiKey !== 'string')) throw new Error('Invalid connection settings.');
      const nextKey = value.apiKey?.trim() || apiKey;
      if (!validKey(nextKey)) throw new Error('Enter a valid OpenAI API key beginning with sk-.');
      if (value.remember) {
        if (!canRemember()) throw new Error('Secure key storage is unavailable. Unlock your Linux keyring or use this key for the current session.');
        let encrypted;
        try { encrypted = safeStorage.encryptString(nextKey).toString('base64'); }
        catch { throw new Error('Your Linux keyring could not protect this key. Unlock it and try again.'); }
        await write({ version: 1, model: value.model, encryptedKey: encrypted });
        saved = true;
      } else {
        // Explicit session-only use removes an older saved key to avoid restoring it.
        await write({ version: 1, model: value.model });
        saved = false;
      }
      apiKey = nextKey; model = value.model; error = '';
      return state();
    }),
    clear: () => serial(async () => {
      await fs.unlink(filename).catch(e => { if (e.code !== 'ENOENT') throw e; });
      apiKey = ''; saved = false; error = '';
      return state();
    }),
  };
}
module.exports = { createConnectionStore };
