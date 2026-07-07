import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PORT = Number(process.env.TRACEVANE_DURABLE_TERMINAL_PORT || 5282);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function hasTmux() {
  return process.platform !== 'win32' && spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function resetTerminalSessions() {
  let sessions = [];
  try {
    const data = await api('/api/terminal/sessions');
    sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  } catch {
    return;
  }
  await Promise.allSettled(sessions.map((session) => api('/api/terminal/end', {
    method: 'POST',
    body: JSON.stringify({ sid: session.sessionId }),
  })));
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await api('/api/files/summary');
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw new Error(`Server did not become ready on ${BASE_URL}: ${lastError?.message || lastError}`);
}

function startServer(label) {
  const child = spawn('bash', ['scripts/dev-web-smoke.sh'], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      TRACEVANE_WEB_PORT: String(PORT),
      TRACEVANE_SMOKE_SKIP_OPTIMIZE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(`[${label}:out] ${chunk}`));
  child.stderr.on('data', (chunk) => logs.push(`[${label}:err] ${chunk}`));
  return { child, logs };
}

async function stopServer(runtime) {
  if (!runtime?.child?.pid) return;
  try {
    process.kill(-runtime.child.pid, 'SIGTERM');
  } catch {}
  await sleep(1500);
  try {
    process.kill(-runtime.child.pid, 'SIGKILL');
  } catch {}
}

async function waitForLedger(sessionId, expected) {
  const deadline = Date.now() + 30_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await api(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/ledger`).catch((error) => ({ error: error.message }));
    const text = Array.isArray(last)
      ? last.map((event) => typeof event?.detail?.data === 'string' ? event.detail.data : '').join('')
      : JSON.stringify(last);
    if (text.includes(expected)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ledger output ${expected}; last=${JSON.stringify(last)?.slice(0, 2000)}`);
}

async function createOrResume(sessionId, rootId, resume = true) {
  return api('/api/terminal/sessions', {
    method: 'POST',
    body: JSON.stringify({
      sid: sessionId,
      rootId,
      workspaceId: rootId,
      cwd: '',
      profileId: 'local-shell',
      shell: 'bash',
      targetKind: 'local',
      cols: 100,
      rows: 24,
      pinned: true,
      resume,
    }),
  });
}

async function sendInput(sessionId, data) {
  await api(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/input`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}

async function run() {
  if (!hasTmux()) {
    console.log('tmux unavailable; durable backend restart smoke skipped');
    return;
  }

  const sessionId = `ide-terminal-durable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `TRACEVANE_DURABLE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let first = null;
  let second = null;

  try {
    first = startServer('first');
    const summary = await waitForServer();
    const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
    if (!rootId) throw new Error('No root available for durable terminal smoke');

    const descriptor = await createOrResume(sessionId, rootId, false);
    if (descriptor.durableBackend !== 'tmux') {
      throw new Error(`Expected first descriptor to be tmux-backed, got ${JSON.stringify(descriptor)}`);
    }
    await sendInput(sessionId, `export TRACEVANE_DURABLE_TOKEN='${token}'\nprintf 'before:%s\\n' "$TRACEVANE_DURABLE_TOKEN"\n`);
    await waitForLedger(sessionId, `before:${token}`);

    await stopServer(first);
    first = null;

    second = startServer('second');
    await waitForServer();
    const resumed = await createOrResume(sessionId, rootId);
    if (resumed.durableBackend !== 'tmux' || resumed.canResume !== true) {
      throw new Error(`Expected resumed descriptor to remain tmux-backed/resumable, got ${JSON.stringify(resumed)}`);
    }
    await sendInput(sessionId, `printf 'after:%s\\n' "$TRACEVANE_DURABLE_TOKEN"\n`);
    await waitForLedger(sessionId, `after:${token}`);
    await api('/api/terminal/end', {
      method: 'POST',
      body: JSON.stringify({ sid: sessionId }),
    }).catch(() => undefined);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nfirstLogs=${first?.logs?.slice(-80).join('') || ''}\nsecondLogs=${second?.logs?.slice(-80).join('') || ''}`);
  } finally {
    await stopServer(first);
    await stopServer(second);
    spawnSync('tmux', ['kill-session', '-t', `tracevane-${sessionId}`], { stdio: 'ignore' });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
