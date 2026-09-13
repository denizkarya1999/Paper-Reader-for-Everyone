import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUpdateService } from '../electron/update-service.cjs';
const directory = await mkdtemp(path.join(os.tmpdir(), 'paper-updates-'));
test.after(() => rm(directory, { recursive: true, force: true }));
function fixture(options = {}) {
  const updater = new EventEmitter(); const scheduled = new Map(); let next = 0;
  const timers = { setTimeout: (callback, delay) => { scheduled.set(++next, { callback, delay }); return next; }, setInterval: (callback, delay) => { scheduled.set(++next, { callback, delay }); return next; }, clearTimeout: id => scheduled.delete(id), clearInterval: id => scheduled.delete(id) };
  const service = createUpdateService({ updater, directory, version: '1.5.0', enabled: true, broadcast() {}, timers, ...options });
  return { updater, service, scheduled };
}
test('automatic update preference survives restart and disabled builds never schedule or check', async () => {
  const { updater, service, scheduled } = fixture();
  await service.start(); assert.equal(scheduled.size, 2);
  assert.equal(updater.autoInstallOnAppQuit, false); assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false);
  await service.setAutomatic(false); assert.equal(scheduled.size, 0);
  const restored = fixture(); await restored.service.start(); assert.equal(restored.service.state().automatic, false); assert.equal(restored.scheduled.size, 0);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'updates.json'))).automatic, false);
  const disabled = fixture({ enabled: false }); disabled.updater.checkForUpdates = () => assert.fail('Development builds must not check');
  await disabled.service.start(); await disabled.service.check(); assert.equal(disabled.scheduled.size, 0);
  await service.setAutomatic(true); assert.equal(scheduled.size, 2); service.stop(); assert.equal(scheduled.size, 0);
});
test('update checks are deduplicated, download progress reaches ready, and installation requires a ready update', async () => {
  const { updater, service } = fixture(); let calls = 0, finish, installs = 0;
  updater.quitAndInstall = () => { installs++; }; service.install(); assert.equal(installs, 0);
  updater.checkForUpdates = async () => { calls++; updater.emit('checking-for-update'); await new Promise(resolve => { finish = resolve; }); updater.emit('update-available', { version: '1.6.0' }); return { downloadPromise: Promise.resolve().then(() => { updater.emit('download-progress', { percent: 54.8 }); assert.equal(service.state().percent, 55); updater.emit('update-downloaded', { version: '1.6.0' }); }) }; };
  const pending = service.check(); await service.check(); await Promise.resolve(); assert.equal(calls, 1);
  finish(); await pending; assert.equal(service.state().status, 'ready'); await service.check(); assert.equal(calls, 1);
  service.install(); assert.equal(installs, 1); assert.equal(service.state().status, 'installing'); service.install(); assert.equal(installs, 1);
  updater.emit('error', new Error('Administrator declined')); assert.equal(service.state().status, 'ready');
  service.install(); assert.equal(installs, 2);
});
test('a failed check is retryable and a successful check reports the current release', async () => {
  const { updater, service } = fixture();
  updater.checkForUpdates = () => { throw new Error('offline'); };
  await service.check(); assert.equal(service.state().status, 'error');
  updater.checkForUpdates = async () => { updater.emit('update-not-available'); return {}; };
  await service.check(); assert.equal(service.state().status, 'current'); assert.ok(service.state().checkedAt);
});

test('Linux installer preserves path arguments and cannot restart after failed authentication', async () => {
  const vm = await import('node:vm');
  let instance, options, outcome = { status: 126 }, relaunched = false;
  class DebUpdater {
    constructor() { instance = this; this.downloadedUpdateHelper = { file: "/home/A reader's folder/update.deb" }; this.app = { relaunch: () => { relaunched = true; } }; }
  }
  const module = { exports: {} };
  vm.runInNewContext(await readFile('electron/updates.cjs', 'utf8'), { module, process: { platform: 'linux', arch: 'x64', env: {} }, require: name => {
    if (name === 'electron-updater/out/DebUpdater') return { DebUpdater };
    if (name === 'node:child_process') return { spawnSync: (...args) => { options = args; return outcome; } };
    if (name === './update-service.cjs') return { createUpdateService: value => value };
    throw new Error('Unexpected dependency');
  } });
  module.exports.createUpdater({ app: { getPath: () => directory, getVersion: () => '1.5.0', isPackaged: true }, broadcast() {} });
  assert.throws(() => instance.doInstall({ isForceRunAfter: true }), /did not finish/); assert.equal(relaunched, false);
  assert.equal(options[0], '/usr/bin/pkexec'); assert.equal(options[1][3], "/home/A reader's folder/update.deb"); assert.equal(options[2].shell, undefined);
  outcome = { status: 0 }; assert.equal(instance.doInstall({ isForceRunAfter: true }), true); assert.equal(relaunched, true);
});
