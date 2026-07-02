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
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-tabs]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-xterm]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-ide-terminal-status]')?.textContent || '';
      return status.includes('终端运行中') || status.includes('终端不可用');
    }, { timeout: 30_000 });
    const statusText = await page.locator('[data-ide-terminal-status]').innerText();
    if (statusText.includes('终端不可用')) throw new Error(statusText);
    await page.locator('[data-ide-panel-resize-handle]').waitFor({ state: 'visible', timeout: 30_000 });
    const box = await page.locator('[data-ide-panel-resize-handle]').boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, Math.max(80, box.y - 60));
      await page.mouse.up();
    }
    await page.getByRole('button', { name: '关闭终端' }).click();
    await page.waitForFunction(() => (document.querySelector('[data-ide-terminal-status]')?.textContent || '').includes('终端已关闭'), { timeout: 30_000 });
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
  await runBackendTerminalRoundtrip(rootId);
  await runUiSmoke(rootId);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
