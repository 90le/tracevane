import type {
  AgentRuntimeRunSource,
  AgentRuntimeRunStatus,
  AgentRuntimeRunSummary,
  AgentRuntimeRunsResponse,
} from "../../../../types/agents.js";
import type {
  ChannelConnectorAgentSessionDriverBindingStatus,
  ChannelConnectorAgentSessionDriverStatusResponse,
} from "../../../../types/channel-connectors.js";
import type { ChatBootstrapPayload, ChatRunState } from "../../../../types/chat.js";
import type {
  TerminalSessionDescriptor,
  TerminalSessionSummaryResponse,
} from "../../../../types/terminal.js";

function terminalRunStatus(status: TerminalSessionDescriptor["status"]): {
  status: AgentRuntimeRunStatus;
  label: string;
} {
  switch (status) {
    case "running":
      return { status: "running", label: "运行中" };
    case "detached":
      return { status: "detached", label: "已分离" };
    case "completed":
      return { status: "completed", label: "已完成" };
    case "failed":
      return { status: "failed", label: "失败" };
    case "lost":
      return { status: "lost", label: "丢失" };
    default:
      return { status: "unknown", label: String(status || "未知") };
  }
}

function chatRunStatus(state: ChatRunState): { status: AgentRuntimeRunStatus; label: string } {
  switch (state) {
    case "running":
    case "streaming":
      return { status: "running", label: state === "streaming" ? "流式中" : "运行中" };
    case "idle":
      return { status: "idle", label: "空闲" };
    case "completed":
      return { status: "completed", label: "已完成" };
    case "aborted":
      return { status: "aborted", label: "已中止" };
    case "error":
      return { status: "failed", label: "错误" };
    default:
      return { status: "unknown", label: "未知" };
  }
}

function inferredCliFromText(value: string): string | null {
  const text = value.toLowerCase();
  if (text.includes("claude")) return "claude";
  if (text.includes("codex")) return "codex";
  if (text.includes("opencode")) return "opencode";
  if (text.includes("bash")) return "bash";
  return null;
}

function sourcePriority(source: AgentRuntimeRunSource): number {
  if (source === "terminal") return 0;
  if (source === "im-channel") return 1;
  return 2;
}

function statusPriority(status: AgentRuntimeRunStatus): number {
  switch (status) {
    case "running":
      return 0;
    case "failed":
    case "lost":
    case "aborted":
      return 1;
    case "detached":
      return 2;
    case "idle":
      return 3;
    case "completed":
      return 4;
    default:
      return 5;
  }
}

function sortRun(left: AgentRuntimeRunSummary, right: AgentRuntimeRunSummary): number {
  const priority = statusPriority(left.status) - statusPriority(right.status);
  if (priority !== 0) return priority;
  const source = sourcePriority(left.source) - sourcePriority(right.source);
  if (source !== 0) return source;
  const leftTime = Date.parse(left.updatedAt || left.startedAt || "") || 0;
  const rightTime = Date.parse(right.updatedAt || right.startedAt || "") || 0;
  return rightTime - leftTime || left.id.localeCompare(right.id);
}

function shouldProjectChatRun(
  runtime: ChatBootstrapPayload["sessions"][number]["runtime"],
): boolean {
  if (runtime.activeRunId) return true;
  if (runtime.lastErrorCode || runtime.lastErrorMessage) return true;
  return runtime.state === "running" || runtime.state === "streaming" || runtime.state === "aborted" || runtime.state === "error";
}

function platformLabel(platform?: string | null): string {
  switch ((platform ?? "").toLowerCase()) {
    case "feishu":
    case "lark":
      return "飞书";
    case "wechat-work":
    case "wecom":
      return "企业微信";
    case "dingtalk":
      return "钉钉";
    case "telegram":
      return "Telegram";
    default:
      return platform ? platform : "IM";
  }
}

function peerKindLabel(peerKind?: string | null): string {
  const value = (peerKind ?? "").toLowerCase();
  if (["user", "private", "p2p", "direct", "single"].includes(value)) return "私聊";
  if (["group", "chat", "room", "channel"].includes(value)) return "群聊";
  if (["thread", "topic"].includes(value)) return "话题";
  return "会话";
}

function bindingSourceLabel(binding: ChannelConnectorAgentSessionDriverBindingStatus | undefined): string {
  if (!binding) return "IM 会话";
  return `${platformLabel(binding.platform)}${peerKindLabel(binding.peerKind)}`;
}

function shorten(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  if (value.length <= 80) return value;
  return `${value.slice(0, 34)}…${value.slice(-24)}`;
}

function terminalTitle(session: TerminalSessionDescriptor, cli: string | null): string {
  const agentLabel = cli && cli !== "bash" ? cli : null;
  const raw = session.title || session.profileId || session.sourceAction || session.sessionId;
  if (agentLabel && !raw.toLowerCase().includes(agentLabel)) return `${agentLabel} · ${raw}`;
  return shorten(raw, session.sessionId);
}

function isAgentCli(cli: string | null): boolean {
  return cli === "claude" || cli === "codex" || cli === "opencode";
}

function isActiveTerminalStatus(status: AgentRuntimeRunStatus): boolean {
  return status === "running" || status === "detached";
}

export function buildAgentRuntimeRunsPayload(input: {
  checkedAt?: string;
  terminalSessions?: TerminalSessionSummaryResponse | null;
  channelSessions?: ChannelConnectorAgentSessionDriverStatusResponse | null;
  chatBootstrap?: ChatBootstrapPayload | null;
}): AgentRuntimeRunsResponse {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const runs: AgentRuntimeRunSummary[] = [];
  const bindingsById = new Map(
    (input.channelSessions?.bindings ?? []).map((binding) => [binding.bindingId, binding] as const),
  );

  for (const session of input.terminalSessions?.sessions ?? []) {
    const state = terminalRunStatus(session.status);
    const cli = inferredCliFromText(`${session.title} ${session.profileId ?? ""} ${session.sourceAction}`);
    const canControl = isAgentCli(cli);
    const primaryHref = "#/ide";
    const lastError = session.recentOutputSummary?.lastError ?? null;
    runs.push({
      id: `terminal:${session.sessionId}`,
      source: "terminal",
      sourceLabel: canControl ? `${cli} 终端` : "终端",
      originId: session.sessionId,
      title: terminalTitle(session, cli),
      agentId: cli,
      cli,
      model: null,
      providerId: null,
      routeScope: cli,
      workspace: session.cwd ?? null,
      status: state.status,
      statusLabel: state.label,
      startedAt: session.createdAt,
      updatedAt: session.lastActiveAt || session.updatedAt,
      error: lastError,
      lastErrorSummary: lastError,
      primaryHref,
      canOpen: true,
      canStop: canControl && isActiveTerminalStatus(state.status),
      canDelete: canControl && !isActiveTerminalStatus(state.status),
      actionLabel: canControl
        ? isActiveTerminalStatus(state.status)
          ? "可在此停止"
          : "可删除记录"
        : "回 IDE 处理",
      actionReason: canControl
        ? "后端识别为 Codex / Claude Code / OpenCode Agent 终端会话。"
        : "普通终端或未知 CLI 会话由 IDE 拥有，CLI Agents 只提供证据入口。",
      metadata: {
        sessionId: session.sessionId,
        profileId: session.profileId ?? null,
        sourceModule: session.sourceModule,
        sourceAction: session.sourceAction,
        controlState: session.controlState,
        observerCount: session.observerCount,
      },
      evidenceRefs: [
        {
          kind: "terminal-session",
          label: session.sessionId,
          href: primaryHref,
        },
      ],
    });
  }

  for (const session of input.channelSessions?.activeSessions ?? []) {
    const failed = Boolean(session.lastError);
    const running = session.running > 0;
    const binding = bindingsById.get(session.bindingId);
    const sourceLabel = bindingSourceLabel(binding);
    const activeModel = session.sessionControl?.model || session.model;
    const activeWorkDir = session.sessionControl?.workDir || session.workDir;
    const titleParts = [sourceLabel, session.agent, activeModel].filter(Boolean);
    const primaryHref = "#/im-channels?view=sessions";
    runs.push({
      id: `im:${session.poolKey || session.sessionId}`,
      source: "im-channel",
      sourceLabel,
      originId: session.sessionId || session.poolKey,
      title: titleParts.join(" · "),
      agentId: session.agent,
      cli: session.agent,
      model: activeModel,
      providerId: null,
      routeScope: session.agent,
      workspace: activeWorkDir,
      status: failed ? "failed" : running ? "running" : "idle",
      statusLabel: failed ? "错误" : running ? "运行中" : "空闲",
      startedAt: session.createdAt,
      updatedAt: session.lastUsedAt,
      error: session.lastError,
      lastErrorSummary: session.lastError,
      primaryHref,
      canOpen: true,
      canStop: false,
      canDelete: false,
      actionLabel: "去 IM 渠道",
      actionReason: "IM 会话的 kill / reset / route override 由 IM Channels 拥有。",
      metadata: {
        poolKey: session.poolKey,
        sessionId: session.sessionId,
        bindingId: session.bindingId,
        projectId: session.projectId,
        sessionKey: session.sessionKey,
        turnCount: session.turnCount,
        running: session.running,
        idleMs: session.idleMs,
        peerKind: binding?.peerKind ?? null,
        peerId: binding?.peerId ?? null,
        accountId: binding?.accountId ?? null,
      },
      evidenceRefs: [
        {
          kind: "im-session",
          label: session.bindingId,
          href: primaryHref,
        },
      ],
    });
  }

  for (const session of input.chatBootstrap?.sessions ?? []) {
    if (!shouldProjectChatRun(session.runtime)) continue;
    const state = chatRunStatus(session.runtime.state);
    const primaryHref = "#/chat";
    runs.push({
      id: `chat:${session.key}`,
      source: "chat",
      sourceLabel: "本地对话",
      originId: session.key,
      title: session.derivedTitle || session.label || session.sessionId || session.key,
      agentId: session.agentId,
      cli: session.agentId,
      model: null,
      providerId: null,
      routeScope: session.agentId,
      workspace: null,
      status: state.status,
      statusLabel: state.label,
      startedAt: null,
      updatedAt: session.runtime.lastEventAt || session.updatedAt,
      error: session.runtime.lastErrorMessage,
      lastErrorSummary: session.runtime.lastErrorMessage,
      primaryHref,
      canOpen: true,
      canStop: false,
      canDelete: false,
      actionLabel: "去对话",
      actionReason: "Chat run 的 abort / reset / history 由 Chat 页面拥有。",
      metadata: {
        sessionKey: session.key,
        sessionId: session.sessionId,
        activeRunId: session.runtime.activeRunId,
        lastErrorCode: session.runtime.lastErrorCode,
        state: session.runtime.state,
      },
      evidenceRefs: [
        {
          kind: "chat-session",
          label: session.key,
          href: primaryHref,
        },
      ],
    });
  }

  runs.sort(sortRun);

  return {
    checkedAt,
    runs,
    totals: {
      total: runs.length,
      running: runs.filter((run) => run.status === "running").length,
      failed: runs.filter((run) => run.status === "failed" || run.status === "lost").length,
      terminal: runs.filter((run) => run.source === "terminal").length,
      imChannel: runs.filter((run) => run.source === "im-channel").length,
      chat: runs.filter((run) => run.source === "chat").length,
    },
  };
}
