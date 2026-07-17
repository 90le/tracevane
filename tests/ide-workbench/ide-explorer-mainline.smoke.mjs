import path from 'node:path';
import { chromium } from '@playwright/test';

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
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  return data;
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeSelector(filePath) {
  return `[data-ide-explorer-node-path="${cssAttr(filePath)}"]`;
}

async function createFile(rootId, filePath, content = '') {
  const directoryPath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const name = filePath.includes('/') ? filePath.slice(filePath.lastIndexOf('/') + 1) : filePath;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content }),
  });
}

async function createDirectory(rootId, directory) {
  const directoryPath = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '';
  const name = directory.includes('/') ? directory.slice(directory.lastIndexOf('/') + 1) : directory;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name }),
  });
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
  const trash = await api(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`).catch(() => null);
  const trashPaths = (trash?.items ?? [])
    .filter((item) => paths.some((target) => item.originalPath === target || String(item.originalPath || '').startsWith(`${target}/`)))
    .map((item) => item.trashPath);
  if (trashPaths.length) {
    await api('/api/files/trash', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, trashPaths }),
    }).catch(() => undefined);
  }
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 360 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom',
      visible: true,
      collapsed: false,
      size: 260,
      bottomSize: 260,
      rightWidth: 420,
      maximized: false,
      activePanelId: 'terminal',
    },
    viewPlacements: [
      { viewId: 'explorer', placement: 'primary-sidebar', order: 0, visible: true },
      { viewId: 'terminal', placement: 'panel', order: 0, visible: true },
      { viewId: 'problems', placement: 'panel', order: 1, visible: true },
      { viewId: 'output', placement: 'panel', order: 2, visible: true },
      { viewId: 'debugConsole', placement: 'panel', order: 3, visible: true },
    ],
    editorGroups: [{ id: 'main', activeTabId: null, tabs: [] }],
    activeEditorGroupId: 'main',
    dockviewLayout: null,
  };
}

async function waitForNode(page, filePath) {
  await page.locator(nodeSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function selectNode(page, filePath) {
  await waitForNode(page, filePath);
  const row = page.locator(nodeSelector(filePath)).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-selected') === 'true',
    nodeSelector(filePath),
    { timeout: 10_000 },
  );
}


async function expandDirectory(page, directoryPath) {
  await waitForNode(page, directoryPath);
  const row = page.locator(nodeSelector(directoryPath)).first();
  if ((await row.getAttribute('aria-expanded')) === 'true') return;
  await row.dblclick();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true',
    nodeSelector(directoryPath),
    { timeout: 30_000 },
  );
}

async function openContextMenu(page, filePath) {
  await waitForNode(page, filePath);
  await page.locator(nodeSelector(filePath)).first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.max(12, rect.left + 12),
      clientY: Math.max(12, rect.top + 12),
    }));
  });
  await page.getByRole('menu').waitFor({ state: 'visible', timeout: 10_000 });
}

async function pointerDrag(page, sourcePath, targetPath) {
  const source = page.locator(nodeSelector(sourcePath)).first();
  const target = page.locator(nodeSelector(targetPath)).first();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`Missing drag boxes for ${sourcePath} -> ${targetPath}`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2 + 8, { steps: 3 });
  await page.locator('[data-ide-explorer-drag-preview]').waitFor({ state: 'visible', timeout: 10_000 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE explorer smoke');

  const explorerBase = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const prefix = `tracevane-ide-explorer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const smokeDir = explorerBase ? `${explorerBase}/.${prefix}` : `.${prefix}`;
  const copySource = `${smokeDir}/keyboard-copy-source.txt`;
  const copyTargetDir = `${smokeDir}/keyboard-copy-target`;
  const copyTarget = `${copyTargetDir}/keyboard-copy-source.txt`;
  const cutSource = `${smokeDir}/keyboard-cut-source.txt`;
  const cutTargetDir = `${smokeDir}/keyboard-cut-target`;
  const cutTarget = `${cutTargetDir}/keyboard-cut-source.txt`;
  const dragSource = `${smokeDir}/drag-source.txt`;
  const dragTargetDir = `${smokeDir}/drag-target`;
  const dragTarget = `${dragTargetDir}/drag-source.txt`;
  const terminalPathSource = `${smokeDir}/terminal path source.txt`;
  const longTail = `${smokeDir}/zz-long-scroll-69.txt`;

  await cleanup(rootId, [smokeDir]);
  await createDirectory(rootId, smokeDir);
  await createDirectory(rootId, copyTargetDir);
  await createDirectory(rootId, cutTargetDir);
  await createDirectory(rootId, dragTargetDir);
  await createFile(rootId, copySource, 'copy source\n');
  await createFile(rootId, cutSource, 'cut source\n');
  await createFile(rootId, dragSource, 'drag source\n');
  await createFile(rootId, terminalPathSource, 'terminal path source\n');
  for (let index = 0; index < 70; index += 1) {
    await createFile(rootId, `${smokeDir}/zz-long-scroll-${String(index).padStart(2, '0')}.txt`, `long ${index}\n`);
  }
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(smokeDir), terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.addInitScript(({ eventName }) => {
      window.__tracevaneTerminalInsertTexts = [];
      window.addEventListener(eventName, (event) => {
        window.__tracevaneTerminalInsertTexts.push(event.detail?.text || '');
      });
    }, { eventName: 'tracevane:ide-terminal-insert-text' });

    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-explorer]').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForNode(page, copySource);

    const scrollMetrics = await page.locator('[data-ide-explorer-scroll]').evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));
    if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
      throw new Error(`Expected long Explorer directory to scroll, got ${JSON.stringify(scrollMetrics)}`);
    }
    await waitForNode(page, longTail);

    await selectNode(page, copySource);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
    await page.getByText('已复制到资源管理器剪贴板').waitFor({ state: 'visible', timeout: 10_000 });
    await selectNode(page, copyTargetDir);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await page.getByText('已粘贴副本').waitFor({ state: 'visible', timeout: 10_000 });
    await expandDirectory(page, copyTargetDir);
    await waitForNode(page, copyTarget);
    await waitForNode(page, copySource);

    await selectNode(page, cutSource);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+X' : 'Control+X');
    await page.getByText('已剪切到资源管理器剪贴板').waitFor({ state: 'visible', timeout: 10_000 });
    await selectNode(page, cutTargetDir);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await page.getByText('已移动到目标目录').waitFor({ state: 'visible', timeout: 10_000 });
    await expandDirectory(page, cutTargetDir);
    await waitForNode(page, cutTarget);
    await page.waitForFunction((selector) => !document.querySelector(selector), nodeSelector(cutSource), { timeout: 30_000 });

    await pointerDrag(page, dragSource, dragTargetDir);
    await expandDirectory(page, dragTargetDir);
    await waitForNode(page, dragTarget);
    await page.waitForFunction((selector) => !document.querySelector(selector), nodeSelector(dragSource), { timeout: 30_000 });

    await openContextMenu(page, terminalPathSource);
    await page.getByRole('menuitem', { name: '插入路径到终端' }).click();
    await page.waitForFunction(
      (expected) => (window.__tracevaneTerminalInsertTexts || []).some((text) => String(text).includes(expected)),
      'terminal path source.txt',
      { timeout: 10_000 },
    );

    await page.locator('[data-ide-explorer-toolbar]').hover();
    await page.getByRole('button', { name: '上传文件' }).click();
    await page.getByRole('dialog', { name: /上传文件到/ }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-upload-manager-choose-folder]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('button', { name: '关闭' }).click();
    await page.getByRole('dialog', { name: /上传文件到/ }).waitFor({ state: 'hidden', timeout: 10_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      explorerText: document.querySelector('[data-ide-explorer]')?.textContent?.slice(0, 1000),
      panelText: document.querySelector('[data-ide-panel]')?.textContent?.slice(0, 800),
      terminalInserts: window.__tracevaneTerminalInsertTexts,
      body: document.body.innerText.slice(0, 1600),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-80).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [smokeDir]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
