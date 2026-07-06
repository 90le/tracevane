import { chromium } from '@playwright/test';
import WebSocket from 'ws';

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
    const error = new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}



async function cleanupPath(rootId, path) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [path], permanent: true }),
  }).catch(() => undefined);
}

function createDefaultWorkbenchLayout() {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath: '' },
    panel: {
      placement: 'bottom',
      visible: true,
      collapsed: false,
      size: 220,
      bottomSize: 220,
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

function toWsUrl(pathname) {
  const url = new URL(pathname, BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function repoRelativeCwd() {
  return process.cwd().replace(/^\/+/, '');
}

async function expectApiFailure(pathname, body, expectedMessagePart) {
  try {
    await api(pathname, { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    if (error.status !== 400) throw error;
    const message = String(error.body?.message || '');
    if (!message.includes(expectedMessagePart)) {
      throw new Error(`Expected failure message to include ${expectedMessagePart}, got ${message}`);
    }
    return;
  }
  throw new Error(`Expected ${pathname} to fail`);
}

async function runBackendTerminalRoundtrip(rootId) {
  const token = `TRACEVANE_M5B_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sid = `ide-terminal-smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const cwd = repoRelativeCwd();

  const catalog = await api('/api/terminal/profiles');
  const profiles = Array.isArray(catalog.profiles) ? catalog.profiles : [];
  const localShell = profiles.find((profile) => profile.id === 'local-shell');
  const bashProfile = profiles.find((profile) => profile.id === 'shell-bash');
  if (!localShell?.launchable) throw new Error(`local-shell profile is not launchable: ${JSON.stringify(localShell)}`);
  if (!bashProfile?.launchable || bashProfile.command !== 'bash') {
    throw new Error(`shell-bash profile is not launchable: ${JSON.stringify(bashProfile)}`);
  }
  if (profiles.some((profile) => /tmux/i.test(`${profile.id} ${profile.command || ''}`) && profile.kind === 'shell')) {
    throw new Error('tmux must not be exposed as a shell profile');
  }

  await expectApiFailure('/api/terminal/sessions', {
    sid: `${sid}-bad-cwd`,
    rootId,
    workspaceId: rootId,
    cwd: '/tmp',
    profileId: 'local-shell',
    shell: 'bash',
  }, 'cwd must be relative');

  await expectApiFailure('/api/terminal/sessions', {
    sid: `${sid}-bad-shell`,
    rootId,
    workspaceId: rootId,
    cwd,
    profileId: 'local-shell',
    shell: 'definitely-not-allowed-shell',
  }, 'terminal_shell_not_allowed');

  await expectApiFailure('/api/terminal/sessions', {
    sid: `${sid}-bad-profile`,
    rootId,
    workspaceId: rootId,
    cwd,
    profileId: 'definitely-not-allowed-profile',
    shell: 'bash',
  }, 'terminal_profile_not_allowed');

  const descriptor = await api('/api/terminal/sessions', {
    method: 'POST',
    body: JSON.stringify({
      sid,
      rootId,
      workspaceId: rootId,
      cwd,
      profileId: 'local-shell',
      shell: 'bash',
      cols: 80,
      rows: 24,
      skipReplay: true,
    }),
  });
  if (descriptor.sessionId !== sid) throw new Error(`Unexpected session id ${descriptor.sessionId}`);
  if (descriptor.shell !== 'bash') throw new Error(`Expected descriptor.shell=bash, got ${descriptor.shell}`);
  if (!String(descriptor.cwd || '').endsWith(process.cwd())) {
    throw new Error(`Terminal cwd was not resolved to repo root: ${descriptor.cwd}`);
  }

  const output = await new Promise((resolve, reject) => {
    const ws = new WebSocket(toWsUrl(`/ws/terminal?${new URLSearchParams({
      sid,
      rootId,
      workspaceId: rootId,
      cwd,
      profileId: 'local-shell',
      shell: 'bash',
      resume: '1',
      skipReplay: '1',
    }).toString()}`));
    let buffer = '';
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out waiting for terminal output; buffer=${buffer.slice(-1000)}`));
    }, 30_000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
      ws.send(`printf '${token}\\n'\r`);
    });
    ws.on('message', (message) => {
      const event = JSON.parse(message.toString());
      if (event.type === 'output') {
        buffer += event.data;
        if (buffer.includes(token)) {
          clearTimeout(timer);
          ws.close();
          resolve(buffer);
        }
      }
      if (event.type === 'error') {
        clearTimeout(timer);
        ws.close();
        reject(new Error(event.message || 'terminal websocket error'));
      }
    });
    ws.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  if (!output.includes(token)) throw new Error(`Missing terminal echo token in output: ${output}`);

  await api('/api/terminal/sessions/' + encodeURIComponent(sid) + '/resize', {
    method: 'POST',
    body: JSON.stringify({ cols: 90, rows: 28 }),
  });

  const end = await api('/api/terminal/end', {
    method: 'POST',
    body: JSON.stringify({ sid }),
  });
  if (!end.success || !end.ended) throw new Error(`Terminal end did not report success: ${JSON.stringify(end)}`);
}

async function runUiSmoke(rootId) {
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(), terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.layout.') || key.startsWith('tracevane.ide-workbench.terminal-layout.')) localStorage.removeItem(key);
    }
  });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-tabs]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-xterm]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => {
      const terminal = document.querySelector('[data-ide-terminal-pane]')?.textContent || '';
      return terminal.includes('running') || terminal.includes('error') || terminal.includes('终端不可用');
    }, { timeout: 30_000 });
    const terminalText = await page.locator('[data-ide-terminal-pane]').first().innerText();
    if (terminalText.includes('终端不可用') || terminalText.includes('error')) throw new Error(terminalText);
    await page.locator('[data-ide-panel-resize-handle]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-new-menu]').click();
    await page.locator('[data-ide-terminal-new-profile-menu]').waitFor({ state: 'visible', timeout: 30_000 });
    const shMenuItem = page.locator('[data-ide-terminal-new-profile="shell-sh"][data-terminal-shell="sh"]');
    await shMenuItem.waitFor({ state: 'visible', timeout: 30_000 });
    await shMenuItem.click();
    await page.waitForFunction(() => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') >= 2, { timeout: 45_000 });
    await page.locator('[data-ide-terminal-tab][data-terminal-shell="sh"]').last().waitFor({ state: 'visible', timeout: 30_000 });

    await page.locator('[data-ide-terminal-pane]').first().evaluate((node) => {
      const file = new File(['terminal clipboard paste smoke\n'], 'terminal-clipboard-paste.txt', { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      node.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }));
    });
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-ide-terminal-pane]')?.textContent || '';
      return text.includes('terminal-paste') && text.includes('terminal-clipboard-paste');
    }, { timeout: 30_000 });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText: async () => '',
          writeText: async () => undefined,
          read: async () => [new ClipboardItem({
            'image/png': new Blob(['terminal clipboard image smoke'], { type: 'image/png' }),
          })],
        },
      });
    });
    await page.locator('[data-ide-terminal-pane]').first().click({ button: 'right' });
    await page.locator('[data-ide-terminal-pane-context-menu]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('menuitem', { name: '粘贴文件/图片为路径' }).click();
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-ide-terminal-pane]')?.textContent || '';
      return text.includes('terminal-paste') && text.includes('clipboard-image') && text.includes('.png');
    }, { timeout: 30_000 });
    const box = await page.locator('[data-ide-panel-resize-handle]').boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, Math.max(80, box.y - 60));
      await page.mouse.up();
    }
    const tabMenu = page.locator('[data-ide-terminal-tab-menu]').first();
    await tabMenu.click();
    await page.locator('[data-ide-terminal-tab-context-menu]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-tab-menu-item=close-tab]').click();
    await page.waitForFunction(() => {
      const layout = document.querySelector('[data-ide-terminal-layout]');
      const count = Number(layout?.getAttribute('data-terminal-pane-count') || '0');
      return count >= 1;
    }, { timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      terminal: document.querySelector('[data-ide-terminal-panel]')?.textContent?.slice(0, 1200),
      panel: document.querySelector('[data-ide-panel]')?.textContent?.slice(0, 1200),
      body: document.body.innerText.slice(0, 1600),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-80).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file root is available for IDE terminal smoke');
  await cleanupPath(rootId, '.tracevane/tmp/terminal-paste');
  await cleanupPath(rootId, 'tmp/tracevane-terminal-paste');
  try {
    await runBackendTerminalRoundtrip(rootId);
    await runUiSmoke(rootId);
  } finally {
    await cleanupPath(rootId, '.tracevane/tmp/terminal-paste');
    await cleanupPath(rootId, 'tmp/tracevane-terminal-paste');
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
