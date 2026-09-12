import { build } from 'vite';
import { build as bundle } from 'esbuild';
import { copyFile, cp, mkdir } from 'node:fs/promises';
await build();
await bundle({ entryPoints: ['lib/ask.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: 'dist/ask.cjs' });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf.worker.min.mjs');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(`node_modules/pdfjs-dist/${folder}`, `dist/${folder}`, { recursive: true });
await mkdir('assets', { recursive: true });
await copyFile('assets/icon.png', 'dist/icon.png');
