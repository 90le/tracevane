// features/terminal/terminal-store.ts
// 终端会话列表 + SSE 输出流。复用旧壳 /api/terminal 契约。
// MVP：会话列表 + 连接 SSE 接收 output 写入 xterm。输入/resize 后续补。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getApiBase, requestJson } from '@/lib/api-client';
import type {
  TerminalGatewayEvent,
  TerminalSessionDescriptor,
  TerminalSessionSummaryResponse,
  TerminalStatusPayload,
} from '../../../../../types/terminal';

export const useTerminalStore = defineStore('terminal', () => {
  const status = ref<TerminalStatusPayload | null>(null);
  const sessions = ref<TerminalSessionDescriptor[]>([]);
  const activeSessionId = ref<string | null>(null);
  const streamConnected = ref(false);
  const errorMessage = ref('');

  // 当前会话的输出缓冲，供 xterm 组件回放 + 实时写入
  const outputBuffer = ref<string[]>([]);
  let eventSource: EventSource | null = null;

  async function loadStatus() {
    try {
      status.value = await requestJson<TerminalStatusPayload>('/api/terminal/status');
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load terminal status.';
    }
  }

  async function loadSessions() {
    try {
      const res = await requestJson<TerminalSessionSummaryResponse>('/api/terminal/sessions');
      sessions.value = res.sessions || [];
      errorMessage.value = '';
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load sessions.';
    }
  }

  function selectSession(sessionId: string) {
    activeSessionId.value = sessionId;
    outputBuffer.value = [];
    connectStream(sessionId);
  }

  function buildStreamUrl(sessionId: string): string {
    return `${getApiBase()}/api/terminal/sessions/${encodeURIComponent(sessionId)}/stream?resume=1`;
  }

  function connectStream(sessionId: string) {
    disconnectStream();
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    eventSource = new EventSource(buildStreamUrl(sessionId), { withCredentials: true });
    eventSource.addEventListener('terminal', (event) => {
      try {
        const payload = JSON.parse(String((event as MessageEvent).data || '')) as TerminalGatewayEvent;
        handleEvent(payload);
      } catch {
        /* ignore parse error */
      }
    });
    eventSource.onerror = () => {
      streamConnected.value = false;
    };
  }

  function handleEvent(payload: TerminalGatewayEvent) {
    switch (payload.type) {
      case 'output':
        outputBuffer.value.push(payload.data);
        streamConnected.value = true;
        break;
      case 'closed':
        streamConnected.value = false;
        break;
      case 'error':
        errorMessage.value = payload.message;
        break;
      case 'reset':
      case 'clear':
        outputBuffer.value = [];
        break;
    }
  }

  function disconnectStream() {
    try {
      eventSource?.close();
    } catch {
      /* ignore */
    }
    eventSource = null;
    streamConnected.value = false;
  }

  async function start() {
    await Promise.all([loadStatus(), loadSessions()]);
  }

  function stop() {
    disconnectStream();
  }

  return {
    status,
    sessions,
    activeSessionId,
    streamConnected,
    errorMessage,
    outputBuffer,
    loadStatus,
    loadSessions,
    selectSession,
    start,
    stop,
  };
});
