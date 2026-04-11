import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import {
  createStandaloneStudioConfig,
  createStudioContext,
  createStudioServer,
} from '../../dist/apps/api/index.js';

const EXPLICIT_PROVIDER_FAILURE_PATTERNS = [
  /\b429\b/,
  /quota/i,
  /insufficient/i,
  /balance/i,
  /billing/i,
  /credit/i,
  /resource package/i,
  /model .* unavailable/i,
  /provider .* unavailable/i,
  /not available/i,
  /unavailable/i,
  /permission/i,
  /access denied/i,
  /余额不足/,
  /无可用资源包/,
  /充值/,
  /套餐暂未开放/,
  /权限/,
];

const EXPLICIT_TOOL_CAPABILITY_PATTERNS = [
  /tools? (?:are )?not available/i,
  /tool access/i,
  /tool capability/i,
  /does not support tools/i,
  /can't access tools/i,
  /cannot access tools/i,
  /unable to use tools/i,
  /当前环境.*工具/,
  /无法使用工具/,
  /不能使用工具/,
  /工具.*不可用/,
  /不支持工具/,
];

export class RealChatIntegrationSkipError extends Error {
  constructor(reason, diagnostics = '') {
    super(reason);
    this.name = 'RealChatIntegrationSkipError';
    this.reason = reason;
    this.diagnostics = diagnostics;
  }
}

export class WaitForAbortError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WaitForAbortError';
  }
}

function trimPreview(value, limit = 200) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return '';
  }
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function safeParseJsonObject(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function lastAssistantMessage(historyPayload) {
  if (!historyPayload || !Array.isArray(historyPayload.messages)) {
    return null;
  }
  return [...historyPayload.messages].reverse().find((entry) => entry?.role === 'assistant') || null;
}

function collectEnvironmentSignals({ historyPayload, events }) {
  const signals = [];
  const push = (label, text, explicitError = false) => {
    const preview = trimPreview(text, 240);
    if (!preview) {
      return;
    }
    signals.push({ label, text: preview, explicitError });
  };

  if (historyPayload?.runtime?.lastErrorMessage) {
    push('history.runtime.lastErrorMessage', historyPayload.runtime.lastErrorMessage, true);
  }
  if (historyPayload?.observability?.lifecycle?.errorMessage) {
    push('history.observability.lifecycle.errorMessage', historyPayload.observability.lifecycle.errorMessage, true);
  }

  const assistant = lastAssistantMessage(historyPayload);
  if (assistant?.text) {
    push(`history.lastAssistant.text${assistant.stopReason === 'error' ? ' (stopReason=error)' : ''}`, assistant.text, assistant.stopReason === 'error');
    const parsed = safeParseJsonObject(assistant.text);
    if (typeof parsed?.errorMessage === 'string') {
      push('history.lastAssistant.errorMessage', parsed.errorMessage, true);
    }
    if (parsed?.error && typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
      push('history.lastAssistant.error.message', parsed.error.message, true);
    }
    if (parsed?.stopReason === 'error') {
      push('history.lastAssistant.stopReason', 'error', true);
    }
  }

  for (const event of events || []) {
    if (!event || typeof event !== 'object') {
      continue;
    }
    if (event.kind === 'error' && event.error?.message) {
      push('ws.error.message', event.error.message, true);
    }
    if (event.kind === 'runtime.state' && event.runtime?.state === 'error') {
      push('ws.runtime.state.error', event.runtime.lastErrorMessage || event.runtime.state, true);
    }
    if (event.kind === 'agent_lifecycle' && event.lifecycle?.phase === 'error') {
      push('ws.agent_lifecycle.error', event.lifecycle.errorMessage || event.lifecycle.phase, true);
    }
    if (event.kind === 'final' && event.message?.stopReason === 'error') {
      push('ws.final.message', event.message.text || event.message.stopReason, true);
    }
  }

  return signals;
}

function findMatchingSignal(signals, patterns, { explicitErrorOnly = false } = {}) {
  return signals.find((signal) => (
    (!explicitErrorOnly || signal.explicitError)
    && patterns.some((pattern) => pattern.test(signal.text))
  )) || null;
}

export function detectRealChatEnvironmentIssue({ historyPayload, events = [] }) {
  const signals = collectEnvironmentSignals({ historyPayload, events });
  const providerFailure = findMatchingSignal(signals, EXPLICIT_PROVIDER_FAILURE_PATTERNS, { explicitErrorOnly: true });
  if (providerFailure) {
    return `upstream provider unavailable or unauthorized: ${providerFailure.label}: ${providerFailure.text}`;
  }

  const sawToolCall = events.some((event) => event?.kind === 'agent_tool_call');
  const toolCapabilityFailure = findMatchingSignal(signals, EXPLICIT_TOOL_CAPABILITY_PATTERNS);
  if (!sawToolCall && toolCapabilityFailure) {
    return `tool capability unavailable in current environment: ${toolCapabilityFailure.label}: ${toolCapabilityFailure.text}`;
  }

  return null;
}

function summarizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return null;
  }
  const summary = {
    kind: event.kind,
  };
  if (typeof event.runId === 'string' && event.runId) {
    summary.runId = event.runId;
  }
  if (event.runtime?.state) {
    summary.runtimeState = event.runtime.state;
  }
  if (event.lifecycle?.phase) {
    summary.phase = event.lifecycle.phase;
  }
  if (event.tool?.name) {
    summary.tool = event.tool.name;
  }
  if (typeof event.partial === 'boolean') {
    summary.partial = event.partial;
  }
  const previewSource = event.error?.message
    || event.lifecycle?.errorMessage
    || event.tool?.resultPreview
    || event.tool?.argsPreview
    || event.message?.text
    || event.accumulatedText
    || null;
  if (previewSource) {
    summary.preview = trimPreview(previewSource, 120);
  }
  return summary;
}

export function formatChatIntegrationDiagnostics({ sessionKey, events = [], historyPayload = null }) {
  const recentEvents = events.slice(-8).map(summarizeEvent).filter(Boolean);
  const assistant = lastAssistantMessage(historyPayload);
  const summary = {
    sessionKey,
    runtime: historyPayload?.runtime || null,
    history: historyPayload
      ? {
        messageCount: historyPayload.messages?.length || 0,
        overlayCount: historyPayload.overlays?.length || 0,
        usage: historyPayload.observability?.usage || null,
        lifecycle: historyPayload.observability?.lifecycle || null,
      }
      : null,
    assistantPreview: trimPreview(assistant?.text || '', 200) || null,
    recentWsEvents: recentEvents,
  };
  return `Integration diagnostics:\n${JSON.stringify(summary, null, 2)}`;
}

export async function analyzeRealChatEnvironment({ baseUrl, sessionKey, events = [], historyPayload = null }) {
  const nextHistoryPayload = historyPayload || await fetchHistorySafe(baseUrl, sessionKey);
  const diagnostics = formatChatIntegrationDiagnostics({
    sessionKey,
    events,
    historyPayload: nextHistoryPayload,
  });
  return {
    historyPayload: nextHistoryPayload,
    diagnostics,
    skipReason: detectRealChatEnvironmentIssue({
      historyPayload: nextHistoryPayload,
      events,
    }),
  };
}

export async function openSessionEventStream(baseUrl, sessionKey) {
  const ws = new WebSocket(`ws://127.0.0.1:${new URL(baseUrl).port}/ws/chat?sessionKey=${encodeURIComponent(sessionKey)}`);
  const events = [];
  ws.addEventListener('message', (raw) => {
    try {
      events.push(JSON.parse(String(raw.data)));
      if (events.length > 80) {
        events.splice(0, events.length - 80);
      }
    } catch {}
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    ws,
    events,
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

export async function startStudioTestServer() {
  const openclawRoot = process.env.OPENCLAW_STUDIO_TEST_OPENCLAW_ROOT;
  if (!openclawRoot) {
    throw new Error('OPENCLAW_STUDIO_TEST_OPENCLAW_ROOT is required for real chat integration tests');
  }
  const port = await getFreePort();
  const config = createStandaloneStudioConfig({
    port,
    openclawRoot,
  });
  const logger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
  const context = createStudioContext({ config, logger });
  const server = createStudioServer(context);
  await server.start();
  const baseUrl = `http://127.0.0.1:${config.port}`;
  return {
    baseUrl,
    context,
    async stop() {
      await server.stop();
    },
  };
}

export async function waitFor(assertion, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      if (error instanceof WaitForAbortError) {
        throw error;
      }
      lastError = error;
      await delay(intervalMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('waitFor timeout');
}

export async function createStudioSession(baseUrl, agentId = 'main') {
  const response = await fetch(`${baseUrl}/api/chat/agents/${encodeURIComponent(agentId)}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

export async function sendChat(baseUrl, sessionKey, text, clientRequestId = `test-${Date.now()}`) {
  const response = await fetch(`${baseUrl}/api/chat/sessions/${encodeURIComponent(sessionKey)}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, clientRequestId }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

export async function fetchHistory(baseUrl, sessionKey) {
  const response = await fetch(`${baseUrl}/api/chat/sessions/${encodeURIComponent(sessionKey)}/history`);
  const payload = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

export async function fetchHistorySafe(baseUrl, sessionKey) {
  try {
    return await fetchHistory(baseUrl, sessionKey);
  } catch {
    return null;
  }
}
