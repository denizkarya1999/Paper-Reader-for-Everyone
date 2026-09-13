const { DebUpdater } = require('electron-updater/out/DebUpdater');
const { spawnSync } = require('node:child_process');
const { createUpdateService } = require('./update-service.cjs');
// Keep authentication and the installer path as individual arguments; no shell is needed.
class PaperUpdater extends DebUpdater {
  doInstall(options) {
    const installer = this.downloadedUpdateHelper?.file;
    if (!installer) throw new Error('No downloaded update is available.');
    const result = spawnSync('/usr/bin/pkexec', ['--disable-internal-agent', '/usr/bin/dpkg', '-i', installer], { encoding: 'utf8', timeout: 180000 });
    if (result.error || result.status !== 0) throw new Error('Linux did not finish installing the update.');
    if (options.isForceRunAfter) this.app.relaunch();
    return true;
  }
}
module.exports.createUpdater = ({ app, broadcast }) => createUpdateService({
  updater: new PaperUpdater({ provider: 'github', owner: 'denizkarya1999', repo: 'Paper-Reader-for-Everyone' }),
  directory: app.getPath('userData'), version: app.getVersion(),
  enabled: app.isPackaged && process.platform === 'linux' && process.arch === 'x64' && !process.env.PAPER_READER_TEST_DATA,
  broadcast,
});
