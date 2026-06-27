import { chromium } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';
const LARGE_BYTES = (2 * 1024 * 1024) + (512 * 1024) + 7;

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  return data;
}

async function waitForRead(rootId, relativePath, expectedSha256) {
  const deadline = Date.now() + 45_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const buffer = Buffer.from(await (await fetch(`${BASE_URL}/api/files/download?${new URLSearchParams({ rootId, path: relativePath }).toString()}`)).arrayBuffer());
      const actualSha = createHash('sha256').update(buffer).digest('hex');
      if (actualSha === expectedSha256) return;
      lastError = new Error(`sha mismatch ${actualSha}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError ?? new Error(`Timed out waiting for ${relativePath}`);
}

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tracevane-upload-resumable-'));
  const fileName = `large-resumable-${Date.now()}.bin`;
  const localFile = path.join(tempDir, fileName);
  const payload = Buffer.alloc(LARGE_BYTES);
  for (let index = 0; index < payload.length; index += 1) payload[index] = index % 251;
  await writeFile(localFile, payload);
  const sha256 = createHash('sha256').update(payload).digest('hex');

  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const smokeDir = `tracevane-upload-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const targetPath = `${smokeDir}/${fileName}`;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: smokeDir }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    let failChunkOne = true;
    await page.route('**/api/files/uploads/*/chunks/1', async (route) => {
      if (failChunkOne) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-file-manager-shell="true"]', { timeout: 30_000 });
    await page.getByRole('button', { name: /^上传$/ }).first().click({ timeout: 30_000 });
    await page.getByLabel('上传目标目录').fill(smokeDir);
    await page.locator('input[type="file"]').first().setInputFiles(localFile);
    await page.getByText(fileName).waitFor({ timeout: 20_000 });
    await page.locator('[data-upload-manager-resumable-badge]').waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: /开始上传|重新开始全部/ }).click();

    await page.getByLabel(/上传文件到/).getByText('失败', { exact: true }).waitFor({ timeout: 45_000 });
    await page.locator('[data-upload-manager-failure-summary]').waitFor({ timeout: 10_000 });
    const checkpoint = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('tracevane.workspace.upload.v1:'));
      return key ? { key, value: JSON.parse(localStorage.getItem(key) || '{}') } : null;
    });
    if (!checkpoint?.value?.uploadId) throw new Error(`Missing resumable upload checkpoint: ${JSON.stringify(checkpoint)}`);
    const statusBeforeResume = await api(`/api/files/uploads/${encodeURIComponent(checkpoint.value.uploadId)}`);
    if (!statusBeforeResume.uploadedChunks?.length) throw new Error(`Expected at least one uploaded chunk before resume: ${JSON.stringify(statusBeforeResume)}`);

    failChunkOne = false;
    await page.getByRole('button', { name: /继续\/重试失败/ }).click();
    await page.getByLabel(/上传文件到/).getByText('已完成', { exact: true }).waitFor({ timeout: 60_000 });
    await waitForRead(rootId, targetPath, sha256);
    const checkpointAfter = await page.evaluate(() => Object.keys(localStorage).filter((item) => item.startsWith('tracevane.workspace.upload.v1:')));
    if (checkpointAfter.length) throw new Error(`Checkpoint should be cleared after completion: ${JSON.stringify(checkpointAfter)}`);

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during resumable upload smoke:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await api('/api/files', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, paths: [smokeDir], permanent: true }),
    }).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
