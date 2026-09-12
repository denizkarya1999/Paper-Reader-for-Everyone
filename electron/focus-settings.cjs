const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const DEFAULT_FOCUS = Object.freeze({ enabled: false, name: 'Mochi', color: 'ginger', minutes: 20, quizzes: false });
function validateFocus(value) {
  if (!value || typeof value.enabled !== 'boolean' || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 24 || !['ginger', 'gray', 'cream'].includes(value.color) || (value.minutes !== null && (!Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 10080)) || typeof value.quizzes !== 'boolean') throw new Error('Invalid cat settings.');
  return { enabled: value.enabled, name: value.name.trim(), color: value.color, minutes: value.minutes, quizzes: value.quizzes };
}
function createFocusStore(directory) {
  let value = { ...DEFAULT_FOCUS }; let writes = Promise.resolve();
  const filename = path.join(directory, 'focus-cat.json');
  return {
    async load() { try { value = validateFocus(JSON.parse(await fs.readFile(filename, 'utf8'))); } catch { value = { ...DEFAULT_FOCUS }; } return { ...value }; },
    get: () => ({ ...value }),
    save(input) { const next = validateFocus(input); const operation = writes.then(async () => {
      await fs.mkdir(directory, { recursive: true }); const temporary = filename + '.' + randomUUID() + '.tmp';
      try { await fs.writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); value = next; }
      finally { await fs.unlink(temporary).catch(() => {}); } return { ...value };
    }); writes = operation.catch(() => {}); return operation; },
  };
}
function reminderDelay(settings) { return settings.enabled && settings.minutes !== null ? settings.minutes * 60_000 : null; }
module.exports = { DEFAULT_FOCUS, validateFocus, createFocusStore, reminderDelay };
