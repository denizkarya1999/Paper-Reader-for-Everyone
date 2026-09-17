import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('desktop: collect, remove, send, pin, restore and clear crops across pages', { timeout: 120000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'paper-reader-crops-ui-'));
  const env = { ...process.env, PAPER_READER_TEST_DATA: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [...(process.env.CI ? ['--no-sandbox'] : []), '.'], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Renderer error:', error.message); });
  app.process().stderr.on('data', data => { if (/Error|error|crash|FATAL/.test(String(data))) console.error(String(data)); });
  try {
    // Intercept only the isolated app's API call; use no real key or user files.
    await app.evaluate(() => {
      globalThis.testRequests = [];
      globalThis.fetch = async (url, options) => {
        if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected network request in test');
        globalThis.testRequests.push(JSON.parse(options.body));
        if (globalThis.holdTestRequest) await new Promise((resolve, reject) => {
          globalThis.finishTestRequest = resolve;
          options.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
        });
        return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: String.raw`## Comparison

A\* does not necessarily accept a goal as soon as it is **generated**. In the example, Bucharest is first reached with cost \(450\), but another frontier node has \(f=417\), so search continues and later finds a route costing \(418\) (PDF pages 18–19).\
In short: **Greedy best-first search** ignores the cost already paid and uses only \(h(n)\), the estimated remaining cost (PDF page 8).

==Key takeaway: generation is not acceptance.==

| Search | Uses |
| --- | --- |
| A* | $g(n) + h(n)$ |` }] }] });
      };
    });
    await page.waitForFunction(() => !!window.paperReader);
    await page.evaluate(() => window.paperReader.saveConnection({ apiKey: 'sk-test-placeholder', model: 'gpt-4.1-mini', remember: false }));
    await page.reload();
    await page.getByRole('button', { name: 'Or try an example' }).click();
    await page.locator('.pdf-page:not(.is-loading)').waitFor();
    await page.getByRole('button', { name: 'Crop areas', exact: true }).click();
    const crop = async (y = .2) => {
      await page.bringToFront();
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
      await page.locator('.pdf-page:not(.is-loading)').waitFor();
      await page.locator('.crop-layer').click({ trial: true });
      const box = await page.locator('.crop-layer').boundingBox();
      await page.mouse.move(box.x + box.width * .12, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .72, box.y + box.height * (y + .08), { steps: 8 });
      await page.mouse.up();
    };
    await crop();
    await expect(page.locator('.crop-card')).toHaveCount(1);
    await crop(.36);
    await expect(page.locator('.crop-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await crop();
    await expect(page.locator('.crop-card')).toHaveCount(3);
    await expect(page.locator('.current-selection')).toHaveCount(1);
    await page.getByLabel('Question about your selection', { exact: true }).fill('Compare these selected areas.');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.locator('.pdf-page:not(.is-loading)').waitFor();
    await expect(page.locator('.crop-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'Crop 1 · Page 1', exact: true }).click();
    await page.locator('.pdf-page:not(.is-loading)').waitFor();
    await expect(page.locator('.current-selection')).toHaveCount(2);
    await page.getByRole('button', { name: 'Remove crop 2', exact: true }).click();
    await expect(page.locator('.crop-card')).toHaveCount(2);
    await expect(page.getByLabel('Question about your selection', { exact: true })).toHaveValue('Compare these selected areas.');
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/multiple-crops.png' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Dark Choose', exact: true }).click();
    await page.getByRole('button', { name: 'Back to reader', exact: true }).click();
    await page.screenshot({ path: 'test-results/multiple-crops-dark.png' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Light Choose', exact: true }).click();
    await page.getByRole('button', { name: 'Back to reader', exact: true }).click();
    await app.evaluate(() => { globalThis.holdTestRequest = true; });
    await page.getByRole('button', { name: 'Ask ChatGPT', exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Remove crop 1', exact: true })).toBeDisabled();
    await expect.poll(() => app.evaluate(() => globalThis.testRequests.length)).toBe(1);
    await app.evaluate(() => { globalThis.finishTestRequest(); globalThis.holdTestRequest = false; });
    await expect(page.locator('.answer-card h2')).toHaveText('Comparison');
    await expect(page.locator('.answer-card strong').first()).toHaveText('generated');
    await expect(page.locator('.answer-card strong').nth(1)).toHaveText('Greedy best-first search');
    await expect(page.locator('.answer-card mark')).toHaveText('Key takeaway: generation is not acceptance.');
    await expect(page.locator('.answer-card .katex')).toHaveCount(5);
    await expect(page.locator('.answer-card .response-table-wrap')).toHaveCount(1);
    await expect(page.locator('.answer-card .response-content')).toContainText('A* does not necessarily');
    await expect(page.locator('.answer-card .response-content br')).toHaveCount(1);
    assert.equal((await page.locator('.answer-card .response-content').innerText()).includes('\\('), false);
    await page.locator('.answer-card').screenshot({ path: 'test-results/formatted-answer.png' });
    await expect(page.locator('.answer-card .assistant-response')).toHaveCSS('user-select', 'text');
    await page.locator('.answer-card').getByRole('button', { name: 'Copy response', exact: true }).click();
    const copied = await page.evaluate(() => window.paperReader.readClipboard());
    assert.match(copied, /A\\\*/);
    assert.match(copied, /\\\(f=417\\\)/);
    const prompt = page.getByLabel('Question about your selection', { exact: true });
    await prompt.fill('');
    await page.locator('.composer').getByRole('button', { name: 'Paste', exact: true }).click();
    await expect(prompt).toHaveValue(copied);
    const sent = await app.evaluate(() => globalThis.testRequests[0]);
    const content = sent.input[0].content;
    assert.equal(content.filter(item => item.type === 'input_file').length, 1);
    assert.equal(content.filter(item => item.type === 'input_image').length, 2);
    assert.match(content[2].text, /PDF page 1/); assert.match(content[4].text, /PDF page 2/);
    await page.getByRole('button', { name: 'Pin as sticky note', exact: true }).click();
    await expect(page.locator('.sticky-card')).toHaveCount(1);
    await expect(page.locator('.note-pin')).toHaveCount(1);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.locator('.pdf-page:not(.is-loading)').waitFor();
    await expect(page.locator('.note-pin')).toHaveCount(1);
    await page.getByRole('button', { name: /^Chats/ }).click();
    await expect(page.locator('.saved-crop')).toHaveCount(2);
    await page.getByRole('button', { name: 'Open in reader', exact: true }).click();
    await expect(page.locator('.crop-card')).toHaveCount(2);
    // Check restart persistence with the same isolated library.
    await page.reload();
    await page.getByRole('button', { name: /A little guide to reading research.pdf/ }).first().click();
    await page.getByRole('button', { name: /^Chats/ }).click();
    await expect(page.locator('.saved-crop')).toHaveCount(2);
    await page.getByRole('button', { name: 'Open in reader', exact: true }).click();
    await expect(page.locator('.crop-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Remove crop 1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Crop 1 · Page 2', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove crop 1', exact: true }).click();
    await expect(page.locator('.crop-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Whole paper', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Question about the whole paper', { exact: true })).toHaveValue('Compare these selected areas.');
    await page.getByRole('button', { name: 'Crop areas', exact: true }).click();
    await crop();
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(page.locator('.crop-card')).toHaveCount(0);
    assert.deepEqual(errors, []);
  } catch (error) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/multiple-crops-failure.png' }).catch(() => {});
    throw error;
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
