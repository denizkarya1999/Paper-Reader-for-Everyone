import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createConnectionStore } from '../electron/connection-store.cjs';

const encryptionKey = randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString(value) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  },
  decryptString(data) {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(-16));
    return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString();
  },
};
async function fixture(t, storage = safeStorage) {
  const directory = await mkdtemp(path.join(tmpdir(), 'paper-connection-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const make = override => createConnectionStore({ directory, safeStorage: override || storage, models: ['gpt-6-astra', 'gpt-5.6-luna'], defaultModel: 'gpt-5.6-luna', platform: 'linux' });
  return { directory, make, file: path.join(directory, 'connection.json') };
}
const initial = { apiKey: 'sk-test-first-key', model: 'gpt-6-astra', remember: true };

test('first run is unconfigured; a protected key and model survive restarting the store', async t => {
  const { make, file } = await fixture(t); const first = make();
  assert.equal((await first.load()).hasKey, false);
  const result = await first.save(initial); assert.equal(result.saved, true);
  assert.equal(result.apiKey, undefined); assert.doesNotMatch(JSON.stringify(result), /sk-test/);
  const disk = await readFile(file, 'utf8');
  assert.doesNotMatch(disk, /sk-test-first-key/);
  assert.ok(JSON.parse(disk).encryptedKey);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const restarted = make(); const state = await restarted.load();
  assert.equal(state.hasKey, true); assert.equal(state.model, 'gpt-6-astra');
  assert.equal(restarted.getKey(), initial.apiKey);
});
test('users can change the model, replace the key, and remove it across restarts', async t => {
  const { make } = await fixture(t); const connection = make();
  await connection.save(initial);
  await connection.save({ model: 'gpt-5.6-luna', remember: true });
  assert.equal(connection.getKey(), initial.apiKey);
  await connection.save({ ...initial, apiKey: 'sk-test-replacement' });
  const second = make(); await second.load(); assert.equal(second.getKey(), 'sk-test-replacement');
  await second.clear(); assert.equal(second.getKey(), '');
  const third = make(); assert.equal((await third.load()).hasKey, false);
});
test('Linux basic_text never stores a key; session-only use does not survive restart', async t => {
  const { make, file } = await fixture(t, { ...safeStorage, getSelectedStorageBackend: () => 'basic_text' });
  const connection = make(); assert.equal(connection.state().canRemember, false);
  await assert.rejects(connection.save(initial), /Secure key storage/);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  await connection.save({ ...initial, remember: false });
  assert.equal(connection.getKey(), initial.apiKey);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).encryptedKey, undefined);
  assert.equal((await make().load()).hasKey, false);
});
test('locked or corrupt credentials are recoverable without exposing or deleting them', async t => {
  const { make, file } = await fixture(t); const first = make(); await first.save(initial);
  const before = await readFile(file, 'utf8');
  const locked = make({ ...safeStorage, isEncryptionAvailable: () => false });
  const state = await locked.load(); assert.equal(state.hasKey, false); assert.equal(state.saved, true);
  assert.match(state.error, /keyring/); assert.equal(await readFile(file, 'utf8'), before);
  await writeFile(file, '{bad json');
  const broken = make(); assert.match((await broken.load()).error, /replacement/);
  await broken.save({ ...initial, apiKey: 'sk-test-recovered' });
  const restored = make(); await restored.load(); assert.equal(restored.getKey(), 'sk-test-recovered');
});
test('invalid input and encryption failures leave a working saved connection intact', async t => {
  const { make, file } = await fixture(t); const first = make(); await first.save(initial);
  const before = await readFile(file, 'utf8');
  await assert.rejects(first.save({ ...initial, apiKey: 'wrong' }), /valid OpenAI API key/);
  await assert.rejects(first.save({ ...initial, model: 'unknown' }), /Invalid connection/);
  assert.equal(await readFile(file, 'utf8'), before);
  const failure = make({ ...safeStorage, encryptString() { throw new Error('backend failure'); } });
  await failure.load();
  await assert.rejects(failure.save({ ...initial, apiKey: 'sk-test-new' }), /keyring/);
  assert.equal(failure.getKey(), initial.apiKey);
  assert.equal(await readFile(file, 'utf8'), before);
});
