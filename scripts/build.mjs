import { build } from 'vite';
import { build as bundle } from 'esbuild';
import { copyFile, cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
await build();
await bundle({ entryPoints: ['lib/ask.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: 'dist/ask.cjs' });
await bundle({ entryPoints: ['electron/updates.cjs'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], outfile: 'dist/updater.cjs' });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(`node_modules/pdfjs-dist/${folder}`, `dist/${folder}`, { recursive: true });
await mkdir('assets', { recursive: true });
await copyFile('assets/icon.png', 'dist/icon.png');
await copyFile('LICENSE', 'dist/LICENSE');
for (const file of ['cat.html', 'cat.css', 'cat.js']) await copyFile('assets/' + file, 'dist/' + file);
// Ship the license notices of every bundled runtime dependency.
const seen = new Set();
async function includeLicenses(name, from) {
  if (seen.has(name)) return;
  seen.add(name);
  const require = createRequire(path.join(from, 'package.json'));
  let directory;
  try { directory = path.dirname(require.resolve(`${name}/package.json`)); }
  catch {
    directory = path.dirname(require.resolve(name));
    while (true) {
      try { if (JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).name === name) break; } catch {}
      const parent = path.dirname(directory); if (parent === directory) throw new Error(`Missing package metadata for ${name}`); directory = parent;
    }
  }
  const destination = path.join('dist', 'licenses', name.replaceAll('/', '__'));
  await mkdir(destination, { recursive: true });
  for (const file of await readdir(directory)) {
    if (/^(licen[sc]e|notice|copying)/i.test(file) && (await stat(path.join(directory, file))).isFile()) await copyFile(path.join(directory, file), path.join(destination, file));
  }
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  for (const child of Object.keys(metadata.dependencies ?? {})) await includeLicenses(child, directory);
}
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
for (const dependency of Object.keys(manifest.dependencies)) await includeLicenses(dependency, process.cwd());
