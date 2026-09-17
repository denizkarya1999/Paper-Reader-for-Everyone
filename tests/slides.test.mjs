import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { convertSlides } = require('../electron/slides.cjs');

test('PowerPoint conversion tries LibreOffice candidates, returns the PDF, and removes temporary files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'paper-reader-slide-test-'));
  const source = path.join(root, 'lecture.pptx'); await writeFile(source, 'fake deck');
  const calls = [];
  try {
    const bytes = await convertSlides(source, root, async (command, args) => {
      calls.push(command);
      if (calls.length === 1) throw new Error('not installed here');
      const output = args[args.indexOf('--outdir') + 1];
      await writeFile(path.join(output, 'lecture.pdf'), Buffer.from('%PDF-1.7\nconverted'));
    });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
    assert.equal(calls.length, 2);
    assert.deepEqual(await readdir(root), ['lecture.pptx']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PowerPoint conversion explains when LibreOffice is unavailable and still cleans up', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'paper-reader-slide-test-'));
  const source = path.join(root, 'lecture.pptx'); await writeFile(source, 'fake deck');
  try {
    await assert.rejects(convertSlides(source, root, async () => { throw new Error('missing'); }), /requires LibreOffice/);
    assert.deepEqual(await readdir(root), ['lecture.pptx']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
