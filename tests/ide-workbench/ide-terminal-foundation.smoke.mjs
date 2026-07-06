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


async function listTerminalSessions() {
  try {
    const data = await api('/api/terminal/sessions');
    return Array.isArray(data?.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

async function countRecoverableTerminalSessions() {
  const sessions = await listTerminalSessions();
  return sessions.filter((session) => session?.canResume || session?.status === 'running' || session?.status === 'detached').length;
}

async function resetTerminalSessions() {
  const sessions = await listTerminalSessions();
  await Promise.allSettled(sessions.map((session) => api('/api/terminal/end', {
    method: 'POST',
    body: JSON.stringify({ sid: session.sessionId }),
  })));
}

async function cleanupPath(rootId, path) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [path], permanent: true }),
  }).catch(() => undefined);
}

async function ensureDirectory(rootId, targetPath) {
  const normalized = normalizePortablePath(targetPath);
  if (!normalized) return;
  const parent = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  await ensureDirectory(rootId, parent);
  const name = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: parent, name }),
  }).catch((error) => {
    if (String(error?.message || error).toLowerCase().includes('exists')) return;
    throw error;
  });
}

async function createFile(rootId, targetPath, content = '') {
  const normalized = normalizePortablePath(targetPath);
  const directoryPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  const name = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized;
  await ensureDirectory(rootId, directoryPath);
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content, overwrite: true }),
  });
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\"');
}

function explorerNodeSelector(path) {
  return `[data-ide-explorer-node-path="${cssAttr(path)}"]`;
}


async function waitForExplorerNode(page, targetPath) {
  await page.locator(explorerNodeSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function expandExplorerDirectory(page, targetPath) {
  await waitForExplorerNode(page, targetPath);
  const row = page.locator(explorerNodeSelector(targetPath)).first();
  const expanded = await row.getAttribute('aria-expanded');
  if (expanded === 'true') return;
  await row.dblclick();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true',
    explorerNodeSelector(targetPath),
    { timeout: 30_000 },
  );
}

async function revealExplorerPath(page, targetPath) {
  const parts = normalizePortablePath(targetPath).split('/').filter(Boolean);
  for (let index = 1; index < parts.length; index += 1) {
    await expandExplorerDirectory(page, parts.slice(0, index).join('/'));
  }
  await waitForExplorerNode(page, targetPath);
}

function createDefaultWorkbenchLayout(explorerDirectoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath: explorerDirectoryPath },
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

function createStaleCreateModeTerminalLayout() {
  const sid = `terminal-stale-create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const paneId = `terminal-pane-${sid}`;
  return {
    version: 1,
    activeTabId: `terminal-tab-${sid}`,
    activePaneId: paneId,
    activeTerminalId: sid,
    tabs: [{
      tabId: `terminal-tab-${sid}`,
      title: 'Stale Create Terminal',
      createdAt: new Date().toISOString(),
      activePaneId: paneId,
      activeTerminalId: sid,
      panes: {
        [paneId]: {
          paneId,
          terminalId: sid,
          title: 'Stale Create Terminal',
          createdAt: new Date().toISOString(),
          profileId: 'local-shell',
          shell: 'bash',
          createMode: 'create',
        },
      },
      root: { type: 'pane', paneId, terminalId: sid },
    }],
  };
}

function terminalLayoutStorageKey(rootId, cwd = '') {
  return `tracevane.ide-workbench.terminal-layout.${rootId || 'pending-root'}:${cwd || 'root'}`;
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

  await expectApiFailure('/api/terminal/sessions', {
    sid: `${sid}-stale-resume`,
    rootId,
    workspaceId: rootId,
    cwd,
    profileId: 'local-shell',
    shell: 'bash',
    resume: true,
  }, 'terminal_session_unavailable');

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
  const focusSmokeFile = `${repoRelativeCwd()}/tracevane-terminal-focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ts`;
  await cleanupPath(rootId, focusSmokeFile);
  await createFile(rootId, focusSmokeFile, 'export const terminalFocus = true;\n');
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(), terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript((layoutKey, layout) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.layout.') || key.startsWith('tracevane.ide-workbench.terminal')) localStorage.removeItem(key);
    }
    localStorage.setItem(layoutKey, JSON.stringify(layout));
  }, `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, createDefaultWorkbenchLayout());
  const logs = [];
  const terminalCreateRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/terminal/sessions') {
      terminalCreateRequests.push(request.postData() || '');
    }
  });
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-tabs]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') === 0, { timeout: 30_000 });
    await page.locator('[data-ide-terminal-empty]').waitFor({ state: 'visible', timeout: 30_000 });
    const emptyCopy = await page.locator('[data-ide-terminal-empty]').innerText();
    if (/\b(workspace|session)\b/.test(emptyCopy)) {
      throw new Error(`Terminal empty state leaked internal wording: ${emptyCopy}`);
    }
    if (!emptyCopy.includes('当前工作区终端') || !emptyCopy.includes('终端会话')) {
      throw new Error(`Terminal empty state did not explain user-facing create/recover behavior: ${emptyCopy}`);
    }
    if (await page.locator('[data-ide-terminal-xterm]').count()) {
      throw new Error('Terminal was auto-created before the user requested a new terminal');
    }
    if (await countRecoverableTerminalSessions() !== 0 || terminalCreateRequests.length !== 0) {
      throw new Error(`Opening the default terminal panel auto-created backend terminal sessions: requests=${terminalCreateRequests.length}`);
    }
    await page.getByRole('button', { name: '关闭 Panel' }).click();
    await page.locator('[data-ide-panel]').waitFor({ state: 'hidden', timeout: 30_000 }).catch(async () => {
      await page.waitForFunction(() => document.querySelector('[data-ide-status-bar]')?.textContent?.includes('panel: collapsed'), { timeout: 30_000 });
    });
    await page.locator('[data-ide-panel-restore-button]').click();
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') === 0, { timeout: 30_000 });
    await page.locator('[data-ide-terminal-empty]').waitFor({ state: 'visible', timeout: 30_000 });
    if (await countRecoverableTerminalSessions() !== 0 || terminalCreateRequests.length !== 0) {
      throw new Error(`Collapsing/restoring an empty terminal panel auto-created backend terminal sessions: requests=${terminalCreateRequests.length}`);
    }
    await page.locator('[data-ide-terminal-empty-manager]').click();
    await page.locator('[data-ide-terminal-manager-dialog]').waitFor({ state: 'visible', timeout: 30_000 });
    const managerEmpty = page.locator('[data-ide-terminal-manager-empty]');
    if (await managerEmpty.count()) {
      const emptyManagerCopy = await managerEmpty.innerText();
      if (!emptyManagerCopy.includes('不会自动创建终端')) {
        throw new Error(`Terminal manager empty state does not explain no auto-create behavior: ${emptyManagerCopy}`);
      }
      await page.locator('[data-ide-terminal-manager-empty-back]').click();
    } else {
      await page.locator('[data-ide-terminal-manager-dialog] [aria-label="关闭终端管理器"]').click();
    }
    await page.locator('[data-ide-terminal-manager-dialog]').waitFor({ state: 'hidden', timeout: 30_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') === 0, { timeout: 30_000 });
    if (await page.locator('[data-ide-terminal-xterm]').count()) {
      throw new Error('Opening the terminal manager from empty state created a terminal');
    }
    await page.evaluate(({ storageKeys, terminalLayout }) => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('tracevane.ide-workbench.terminal-layout.')) localStorage.removeItem(key);
      }
      for (const key of storageKeys) localStorage.setItem(key, JSON.stringify(terminalLayout));
    }, { storageKeys: [terminalLayoutStorageKey(rootId), terminalLayoutStorageKey(rootId, '/')], terminalLayout: createStaleCreateModeTerminalLayout() });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') === 0, { timeout: 30_000 });
    await page.locator('[data-ide-terminal-empty]').waitFor({ state: 'visible', timeout: 30_000 });
    if (await page.locator('[data-ide-terminal-xterm]').count()) {
      throw new Error('Persisted create-mode terminal layout auto-created a terminal on reload');
    }
    if (await countRecoverableTerminalSessions() !== 0 || terminalCreateRequests.length !== 0) {
      throw new Error(`Reloading a stale create-mode layout auto-created backend terminal sessions: requests=${terminalCreateRequests.length}`);
    }
    terminalCreateRequests.length = 0;
    await page.locator('[data-ide-terminal-empty-new]').click();
    await page.locator('[data-ide-terminal-xterm]').first().waitFor({ state: 'visible', timeout: 30_000 });
    if (terminalCreateRequests.length !== 1) {
      throw new Error(`Explicit New Terminal should create exactly one backend terminal session, got ${terminalCreateRequests.length}`);
    }
    await page.waitForFunction(() => {
      const terminal = document.querySelector('[data-ide-terminal-pane]')?.textContent || '';
      return terminal.includes('running') || terminal.includes('error') || terminal.includes('终端不可用');
    }, { timeout: 30_000 });
    const terminalText = await page.locator('[data-ide-terminal-pane]').first().innerText();
    if (terminalText.includes('终端不可用') || terminalText.includes('error')) throw new Error(terminalText);
    await page.locator('[data-ide-terminal-xterm]').first().click();
    const focusLeakToken = `TRACEVANE_TERMINAL_FOCUS_LEAK_${Date.now()}`;
    await page.locator('[data-ide-editor-dock]').click({ position: { x: 12, y: 12 } });
    await page.keyboard.type(focusLeakToken);
    await page.waitForTimeout(300);
    const terminalAfterEditorClick = await page.locator('[data-ide-terminal-pane]').first().innerText();
    if (terminalAfterEditorClick.includes(focusLeakToken)) {
      throw new Error('Terminal kept receiving keyboard input after clicking the editor dock');
    }
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'terminal-focus-regression-probe';
      input.setAttribute('aria-label', 'terminal focus regression probe');
      input.style.position = 'fixed';
      input.style.left = '8px';
      input.style.top = '8px';
      input.style.zIndex = '99999';
      document.body.appendChild(input);
    });
    await page.locator('#terminal-focus-regression-probe').click();
    await page.keyboard.type('focus-ok');
    const focusProbe = await page.evaluate(() => ({
      activeId: document.activeElement?.id || '',
      value: document.getElementById('terminal-focus-regression-probe')?.value || '',
    }));
    if (focusProbe.activeId !== 'terminal-focus-regression-probe' || focusProbe.value !== 'focus-ok') {
      throw new Error(`Terminal stole focus from external input: ${JSON.stringify(focusProbe)}`);
    }
    await page.locator('[data-ide-terminal-xterm]').first().click();
    await page.getByLabel('新建文件').click({ timeout: 30_000 });
    const explorerInput = page.locator('[data-ide-explorer-name-input]');
    await explorerInput.waitFor({ state: 'visible', timeout: 30_000 });
    await explorerInput.fill('');
    await page.keyboard.type('terminal-focus-explorer-input.txt');
    const explorerInputValue = await explorerInput.inputValue();
    if (explorerInputValue !== 'terminal-focus-explorer-input.txt') {
      throw new Error(`Terminal stole focus from Explorer name input: ${explorerInputValue}`);
    }
    await page.keyboard.press('Escape');
    await page.locator('[data-ide-explorer-name-dialog]').waitFor({ state: 'hidden', timeout: 30_000 });

    await page.locator('[data-ide-terminal-xterm]').first().click();
    await revealExplorerPath(page, focusSmokeFile);
    await page.locator(explorerNodeSelector(focusSmokeFile)).first().dblclick({ timeout: 30_000 });
    await page.locator(`[data-ide-editor-tab-path="${cssAttr(focusSmokeFile)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-monaco-editor-panel][data-ide-editor-file-path="' + cssAttr(focusSmokeFile) + '"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('.monaco-editor').first().click();
    const monacoToken = `terminal_focus_monaco_${Date.now()}`;
    await page.keyboard.type(`
// ${monacoToken}`);
    await page.waitForFunction((token) => document.body.innerText.includes(token), monacoToken, { timeout: 30_000 });
    const terminalAfterMonacoTyping = await page.locator('[data-ide-terminal-pane]').first().innerText();
    if (terminalAfterMonacoTyping.includes(monacoToken)) {
      throw new Error('Terminal received Monaco editor typing after editor focus');
    }
    await page.locator('[data-ide-panel-resize-handle]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-new-menu]').click();
    await page.locator('[data-ide-terminal-new-profile-menu]').waitFor({ state: 'visible', timeout: 30_000 });
    const menuBox = await page.locator('[data-ide-terminal-new-profile-menu]').boundingBox();
    if (!menuBox || menuBox.x < 0 || menuBox.x + menuBox.width > page.viewportSize().width) {
      throw new Error(`New Terminal profile menu is clipped or offscreen: ${JSON.stringify(menuBox)}`);
    }
    const setShDefault = page.locator('[data-ide-terminal-set-default-profile="shell-sh"]');
    await setShDefault.waitFor({ state: 'visible', timeout: 30_000 });
    await setShDefault.click();
    await page.locator('[data-ide-terminal-set-default-profile="shell-sh"][data-ide-terminal-default-profile="true"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.locator('[data-ide-terminal-new-profile-menu]').waitFor({ state: 'hidden', timeout: 30_000 });
    await page.locator('[data-ide-terminal-new]').click();
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
    const viewport = page.viewportSize();
    const terminalPaneBox = await page.locator('[data-ide-terminal-pane]').first().boundingBox();
    if (!viewport || !terminalPaneBox) throw new Error('Terminal pane bounds were not available for context menu smoke');
    await page.mouse.click(
      Math.min(terminalPaneBox.x + terminalPaneBox.width - 2, viewport.width - 2),
      Math.min(terminalPaneBox.y + terminalPaneBox.height - 2, viewport.height - 2),
      { button: 'right' },
    );
    await page.locator('[data-ide-terminal-pane-context-menu]').waitFor({ state: 'visible', timeout: 30_000 });
    const paneMenuBox = await page.locator('[data-ide-terminal-pane-context-menu]').boundingBox();
    if (!paneMenuBox || paneMenuBox.x < 0 || paneMenuBox.y < 0 || paneMenuBox.x + paneMenuBox.width > viewport.width || paneMenuBox.y + paneMenuBox.height > viewport.height) {
      throw new Error(`Terminal pane context menu is clipped or offscreen: ${JSON.stringify(paneMenuBox)}`);
    }
    await page.keyboard.press('Escape');
    await page.locator('[data-ide-terminal-pane-context-menu]').waitFor({ state: 'hidden', timeout: 30_000 });
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
    await cleanupPath(rootId, focusSmokeFile);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file root is available for IDE terminal smoke');
  await resetTerminalSessions();
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
