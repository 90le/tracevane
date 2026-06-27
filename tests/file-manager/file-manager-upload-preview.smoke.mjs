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

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tracevane-file-manager-upload-'));
  const fileName = `upload-preview-${Date.now()}.md`;
  const fileContent = `# Tracevane upload smoke\n\n- uploaded at ${new Date().toISOString()}\n- preview should render this Markdown.\n`;
  const filePath = path.join(tempDir, fileName);
  await writeFile(filePath, fileContent, 'utf8');

  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const smokeDir = `tracevane-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^上传$/ }).first().click({ timeout: 30_000 });
    await page.getByLabel('上传目标目录').fill(smokeDir);

    await page.locator('input[type="file"]').first().setInputFiles(filePath);

    await page.getByText(fileName).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: /开始上传|重新开始全部/ }).click();
    await page.getByText('已完成').waitFor({ timeout: 30_000 });

    const read = await api(`/api/files/read?${new URLSearchParams({ rootId, path: `${smokeDir}/${fileName}` })}`);
    if (read.content !== fileContent) {
      throw new Error(`Uploaded file content mismatch: ${JSON.stringify(read.content)}`);
    }

    await page.getByRole('button', { name: '关闭' }).last().click();
    const pathInput = page.getByLabel('编辑文件夹路径，按 Enter 跳转');
    await pathInput.fill(smokeDir);
    await pathInput.press('Enter');
    const uploadedRow = page.locator(`[data-file-manager-entry-path="${smokeDir}/${fileName}"]`).first();
    await uploadedRow.waitFor({ timeout: 30_000 });
    await uploadedRow.scrollIntoViewIfNeeded();
    await uploadedRow.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-file-preview-dialog]', { timeout: 30_000 });
    await page.waitForSelector('[data-document-workbench-viewport]', { timeout: 30_000 });
    await page.getByText('Tracevane upload smoke').waitFor({ timeout: 30_000 });
    const modalError = await page.locator('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').count();
    if (modalError > 0) throw new Error('File preview opened with an error boundary');
    if (logs.some((line) => line.includes('[pageerror]'))) {
      throw new Error(`Browser page error during upload/preview smoke:\n${logs.join('\n')}`);
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
