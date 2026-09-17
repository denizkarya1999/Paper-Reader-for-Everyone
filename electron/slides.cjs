const path = require('node:path');
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const defaultRunner = promisify(require('node:child_process').execFile);

const commands = ['/usr/bin/libreoffice', '/usr/bin/soffice', '/snap/bin/libreoffice', 'libreoffice', 'soffice'];

async function convertSlides(filename, temporaryRoot, runner = defaultRunner) {
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'paper-reader-slides-'));
  try {
    // Snap LibreOffice cannot read /tmp. A copied source and isolated profile in the
    // user's Documents folder also prevent an open LibreOffice window from taking over.
    const source = path.join(directory, 'source-' + path.basename(filename));
    await fs.copyFile(filename, source);
    const profile = pathToFileURL(path.join(directory, 'profile')).href;
    const args = [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', directory, source];
    let converted = false;
    for (const command of commands) {
      try { await runner(command, args, { timeout: 120_000, maxBuffer: 2_000_000, windowsHide: true }); converted = true; break; }
      catch {}
    }
    if (!converted) throw new Error('Opening PowerPoint slides requires LibreOffice. Install LibreOffice Impress, then try again.');
    const output = (await fs.readdir(directory)).find(file => file.toLowerCase().endsWith('.pdf'));
    if (!output) throw new Error('The slide deck could not be converted. Try opening it in PowerPoint or LibreOffice and exporting it as a PDF.');
    const bytes = await fs.readFile(path.join(directory, output));
    if (bytes.length > 50 * 1024 * 1024) throw new Error('The converted slide deck is larger than 50 MB. Export a smaller PDF and try again.');
    return new Uint8Array(bytes);
  } finally { await fs.rm(directory, { recursive: true, force: true }).catch(() => {}); }
}

module.exports = { convertSlides };
