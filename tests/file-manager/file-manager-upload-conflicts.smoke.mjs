import { chromium } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

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
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  }
  return data;
}

async function readText(rootId, relativePath) {
  const search = new URLSearchParams({ rootId, path: relativePath });
  return (await api(`/api/files/read?${search.toString()}`)).content;
}

async function exists(rootId, relativePath) {
  try {
    await readText(rootId, relativePath);
    return true;
  } catch {
    return false;
  }
}

async function uploadOnce(page, targetDirectory, localFile, conflictPolicy, expectedStatusText) {
  await page.getByRole('button', { name: /^上传$/ }).first().click({ timeout: 30_000 });
  await page.getByLabel('上传目标目录').fill(targetDirectory);
  await page.getByLabel('上传重名处理').selectOption(conflictPolicy);
  await page.locator('input[type="file"]').first().setInputFiles(localFile);
  await page.getByRole('button', { name: /开始上传|重新开始全部/ }).click();
  await page.getByText(expectedStatusText, { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: '关闭' }).last().click();
  await page.waitForSelector('[data-upload-task-strip]', { state: 'detached', timeout: 10_000 });
}

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tracevane-upload-conflict-'));
  const fileName = 'same-name.txt';
  const localFile = path.join(tempDir, fileName);
  const existingContent = 'existing content must survive skip\n';
  const incomingContent = `incoming conflict content ${Date.now()}\n`;
  await writeFile(localFile, incomingContent, 'utf8');

  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const smokeDir = `tracevane-upload-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const originalPath = `${smokeDir}/${fileName}`;
  const renamedPath = `${smokeDir}/same-name (1).txt`;

  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: smokeDir }),
  });
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: smokeDir, name: fileName, content: existingContent, overwrite: true }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-file-manager-shell="true"]', { timeout: 30_000 });

    await uploadOnce(page, smokeDir, localFile, 'skip', '已跳过');
    const afterSkip = await readText(rootId, originalPath);
    if (afterSkip !== existingContent) {
      throw new Error(`Skip conflict policy overwrote existing file: ${JSON.stringify(afterSkip)}`);
    }
    if (await exists(rootId, renamedPath)) {
      throw new Error('Skip conflict policy unexpectedly created a renamed copy');
    }

    await uploadOnce(page, smokeDir, localFile, 'rename', '已完成');
    const afterRenameOriginal = await readText(rootId, originalPath);
    const renamed = await readText(rootId, renamedPath);
    if (afterRenameOriginal !== existingContent) {
      throw new Error('Rename conflict policy changed the original file');
    }
    if (renamed !== incomingContent) {
      throw new Error(`Rename conflict policy did not preserve incoming content: ${JSON.stringify(renamed)}`);
    }

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during upload conflict smoke:\n${logs.join('\n')}`);
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
