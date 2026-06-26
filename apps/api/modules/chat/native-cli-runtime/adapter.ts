import path from 'node:path';
import type { TracevaneServerConfig } from '../../../../../types/api.js';
import type {
  ChatSendAttachment,
  ChatSendFileRef,
  ChatSessionRow,
  ChatSessionRuntimeTarget,
} from '../../../../../types/chat.js';
import { CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS } from '../../../../../types/channel-connectors.js';
import type {
  ChannelConnectorAgentId,
  ChannelConnectorInboundAttachment,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorPermissionMode,
  ChannelConnectorsDaemonRuntimeConfig,
} from '../../../../../types/channel-connectors.js';
import { MODEL_GATEWAY_DEFAULT_HOST, MODEL_GATEWAY_DEFAULT_PORT } from '../../../../../types/model-gateway.js';
import {
  runChannelConnectorAgentTurn,
  type ChannelConnectorAgentProcessRunner,
  type ChannelConnectorAgentProgressEvent,
  type ChannelConnectorRuntimeBinding,
  type ChannelConnectorRuntimeProject,
} from '../../channel-connectors/agent-runner.js';
import { resolveChannelConnectorGatewayClientKey } from '../../channel-connectors/gateway-secret.js';
import { ChatServiceError, buildChatError } from '../errors.js';
import {
  normalizeChatRuntimeAbortResult,
  normalizeChatRuntimeDeleteResult,
  normalizeChatRuntimeHistoryResult,
  normalizeChatRuntimeListSessionsResult,
  normalizeChatRuntimeResetResult,
  type ChatRuntimeAdapter,
  type ChatRuntimeSendInput,
} from '../runtime-adapter.js';
import { normalizeString } from '../shared.js';

export const SUPPORTED_NATIVE_CHAT_AGENT_IDS = CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS;
const SUPPORTED_NATIVE_CHAT_AGENT_ID_SET = new Set<string>(SUPPORTED_NATIVE_CHAT_AGENT_IDS);

const NATIVE_CHAT_AGENT_ALIASES: Record<string, ChannelConnectorAgentId> = {
  codex: 'codex',
  'openai-codex': 'codex',
  'codex-cli': 'codex',
  'claude-code': 'claude-code',
  claude: 'claude-code',
  'claude-code-cli': 'claude-code',
  opencode: 'opencode',
  'open-code': 'opencode',
  open_code: 'opencode',
};

export type NativeChatActiveRun = {
  runId: string;
  controller: AbortController;
  startedAt: string;
};

export type NativeChatActiveRuns = Map<string, NativeChatActiveRun>;

export interface NativeCliChatMediaBridge {
  buildNativeInboundAttachments(
    sessionKey: string,
    fileRefs: ChatSendFileRef[] | undefined,
    attachments: ChatSendAttachment[] | undefined,
  ): ChannelConnectorInboundAttachment[];
}

export interface NativeCliChatRuntimeAdapterOptions {
  config: TracevaneServerConfig;
  session: ChatSessionRow;
  runtimeSession: { agentNativeSessionId?: string | null; codexThreadId?: string | null } | null;
  activeRuns: NativeChatActiveRuns;
  mediaBridge: NativeCliChatMediaBridge;
  onProgress: (sessionKey: string, requestId: string, event: ChannelConnectorAgentProgressEvent) => void;
  processRunner?: ChannelConnectorAgentProcessRunner;
}

function safeRuntimePathSegment(value: string, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return normalized || fallback;
}

function resolveChatGatewayEndpoint(): string {
  return `http://${MODEL_GATEWAY_DEFAULT_HOST}:${MODEL_GATEWAY_DEFAULT_PORT}/v1`;
}

function buildChatChannelConnectorPaths(config: TracevaneServerConfig): Pick<ChannelConnectorsDaemonRuntimeConfig, 'paths'>['paths'] {
  const root = path.join(config.openclawRoot, 'tracevane', 'chat-native-cli');
  return {
    root,
    state: path.join(root, 'state'),
    log: path.join(root, 'logs'),
    runtime: path.join(root, 'runtime'),
    octoEvents: path.join(root, 'octo-events'),
    feishuEvents: path.join(root, 'feishu-events'),
  };
}

export function normalizeNativeChatAgent(agent: string | null | undefined): ChannelConnectorAgentId | null {
  const normalized = normalizeString(agent);
  const candidate = NATIVE_CHAT_AGENT_ALIASES[normalized] ?? normalized;
  return SUPPORTED_NATIVE_CHAT_AGENT_ID_SET.has(candidate) ? candidate as ChannelConnectorAgentId : null;
}

export function assertSupportedNativeRuntimeTarget(target: ChatSessionRuntimeTarget): void {
  if (target.adapterKind !== 'native-cli') {
    return;
  }
  if (normalizeNativeChatAgent(target.agent)) {
    return;
  }
  throw new ChatServiceError(400, buildChatError(
    'invalid_request',
    `Native CLI agent '${target.agent || 'unknown'}' is not supported. Supported agents: ${SUPPORTED_NATIVE_CHAT_AGENT_IDS.join(', ')}`,
  ));
}

function normalizeNativePermissionMode(value: string | null | undefined): ChannelConnectorPermissionMode {
  const normalized = normalizeString(value);
  if (
    normalized === 'read-only'
    || normalized === 'auto-edit'
    || normalized === 'full-auto'
    || normalized === 'plan'
    || normalized === 'yolo'
  ) {
    return normalized;
  }
  return 'suggest';
}

function buildChatNativeBinding(agent: ChannelConnectorAgentId): ChannelConnectorRuntimeBinding {
  return {
    id: 'tracevane-chat-web',
    platform: 'octo',
    accountId: 'tracevane-chat',
    botId: null,
    displayName: 'Tracevane Chat',
    agent,
    enabled: true,
    allowlist: [],
    adminUsers: [],
    disabledCommands: [],
    metadata: {
      source: 'tracevane-chat',
      nativeCli: true,
    },
  };
}

function buildChatNativeProject(config: TracevaneServerConfig, session: ChatSessionRow, agent: ChannelConnectorAgentId): ChannelConnectorRuntimeProject {
  const target = session.runtimeTarget;
  const gatewayEndpoint = resolveChatGatewayEndpoint();
  return {
    id: safeRuntimePathSegment(`chat-${session.key}`, 'chat-session'),
    name: normalizeString(session.label, 'Tracevane Chat'),
    workDir: normalizeString(target.workDir) || config.projectRoot || config.openclawRoot,
    agent,
    model: normalizeString(target.model) || null,
    permissionMode: normalizeNativePermissionMode(target.permissionMode),
    gatewayEndpoint,
    gatewayKeyRef: 'tracevane-gateway-client-key',
    appProfileRef: 'tracevane-chat',
    platformBindings: [buildChatNativeBinding(agent)],
  };
}

function buildChatNativeMessage(mediaBridge: NativeCliChatMediaBridge, input: ChatRuntimeSendInput): ChannelConnectorOctoInboundMessage {
  const nativeAttachments = mediaBridge.buildNativeInboundAttachments(
    input.sessionKey,
    input.fileRefs,
    input.attachments,
  );
  return {
    messageId: input.idempotencyKey,
    fromUid: 'tracevane-web-user',
    channelId: input.sessionKey,
    channelType: 1,
    timestamp: Date.now(),
    payload: {
      type: 1,
      content: input.message,
      plain: input.message,
    },
    metadata: {
      source: 'tracevane-chat',
      surface: 'agent-chat',
      runtimeAdapter: 'native-cli',
    },
    attachments: nativeAttachments.length ? nativeAttachments : undefined,
  };
}

export function createNativeCliChatRuntimeAdapter(options: NativeCliChatRuntimeAdapterOptions): ChatRuntimeAdapter {
  const { activeRuns, config, mediaBridge, processRunner, runtimeSession, session } = options;
  const agent = normalizeNativeChatAgent(session.runtimeTarget.agent);
  return {
    kind: 'native-cli',
    async send(input) {
      if (!agent) {
        return {
          status: 'started',
          runId: input.idempotencyKey,
          raw: { ok: false, error: `Agent ${session.runtimeTarget.agent} is not supported by the native Chat runner yet.` },
          terminalState: 'error',
          assistantText: null,
          errorMessage: `Agent ${session.runtimeTarget.agent} is not supported by the native Chat runner yet.`,
        };
      }
      const paths = buildChatChannelConnectorPaths(config);
      const project = buildChatNativeProject(config, session, agent);
      const binding = project.platformBindings[0];
      const progressEvents: ChannelConnectorAgentProgressEvent[] = [];
      const runId = input.idempotencyKey;
      const controller = new AbortController();
      activeRuns.set(input.sessionKey, {
        runId,
        controller,
        startedAt: new Date().toISOString(),
      });
      try {
        const result = await runChannelConnectorAgentTurn({
          project,
          binding,
          message: buildChatNativeMessage(mediaBridge, input),
          sessionKey: input.sessionKey,
          gatewayEndpoint: project.gatewayEndpoint,
          gatewayClientKey: resolveChannelConnectorGatewayClientKey({ paths }),
          agentRuntimeDir: path.join(
            paths.runtime,
            safeRuntimePathSegment(agent, 'agent'),
            safeRuntimePathSegment(input.sessionKey, 'session'),
          ),
          session: runtimeSession,
          signal: controller.signal,
          onProgress: (event) => {
            progressEvents.push(event);
            options.onProgress(input.sessionKey, input.idempotencyKey, event);
          },
          processRunner,
        });
        return {
          status: 'started',
          runId,
          raw: {
            ...result,
            progressEvents,
          } as unknown as Record<string, unknown>,
          terminalState: result.status === 'completed' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : 'error',
          assistantText: result.replyText,
          errorMessage: result.error,
          durationMs: result.durationMs,
          nativeSession: result.session,
        };
      } finally {
        if (activeRuns.get(input.sessionKey)?.runId === runId) {
          activeRuns.delete(input.sessionKey);
        }
      }
    },
    async abort(input) {
      const active = activeRuns.get(input.sessionKey);
      if (!active) {
        return normalizeChatRuntimeAbortResult({
          aborted: false,
          runIds: [],
          native: true,
        });
      }
      active.controller.abort();
      return normalizeChatRuntimeAbortResult({
        aborted: true,
        runIds: [active.runId],
        native: true,
        startedAt: active.startedAt,
      });
    },
    async reset() {
      return normalizeChatRuntimeResetResult({ ok: true, native: true });
    },
    async deleteSession() {
      return normalizeChatRuntimeDeleteResult({ ok: true, native: true });
    },
    async listSessions() {
      return normalizeChatRuntimeListSessionsResult({ sessions: [] });
    },
    async readHistory() {
      return normalizeChatRuntimeHistoryResult({ messages: [] });
    },
  };
}
