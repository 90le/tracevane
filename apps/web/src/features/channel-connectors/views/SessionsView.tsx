import * as React from "react";
import { Activity, AlertTriangle, MessageSquare, Recycle, XCircle } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import {
  useChannelConnectorsAgentSessionsQuery,
  useChannelConnectorsConfigQuery,
  useManageChannelConnectorsAgentSessionsMutation,
  useManageChannelConnectorsDaemonServiceMutation,
  useSaveChannelConnectorsConfigMutation,
} from "@/lib/query/channel-connectors";
import type {
  ChannelConnectorAgentSessionDriverBindingStatus,
  ChannelConnectorAgentSessionDriverRuntimeEvent,
  ChannelConnectorAgentSessionRuntimeStatus,
} from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead, formatTime } from "./_shared";

const EVENT_TONE: Record<
  ChannelConnectorAgentSessionDriverRuntimeEvent["type"],
  "ok" | "warn" | "bad" | "mute"
> = {
  "session.created": "ok",
  "session.stopped": "mute",
  "session.killed": "warn",
  "session.disposed": "mute",
  "session.reaped": "warn",
  "turn.started": "ok",
  "turn.finished": "ok",
  "turn.failed": "bad",
  "turn.fallback": "warn",
};

function humanEvent(event: ChannelConnectorAgentSessionDriverRuntimeEvent): {
  title: string;
  detail: string;
  action: string;
  variant: "ok" | "warn" | "bad" | "mute";
} {
  if (event.error) {
    return {
      title: "Agent 执行失败",
      detail: event.error,
      action: "需要检查模型路由 / Agent 日志",
      variant: "bad",
    };
  }
  switch (event.type) {
    case "turn.failed":
      return { title: "Agent 回合失败", detail: event.reason || "上游返回失败或本地执行异常", action: "查看诊断日志", variant: "bad" };
    case "turn.fallback":
      return { title: "已触发 fallback", detail: event.reason || "主路径不可用，已尝试备用投递", action: "检查路由模型是否匹配", variant: "warn" };
    case "turn.started":
      return { title: "开始处理消息", detail: `${event.agent} 正在处理 ${event.bindingId}`, action: "等待回复", variant: "ok" };
    case "turn.finished":
      return { title: "Agent 回复完成", detail: event.reason || `${event.agent} 已完成本回合`, action: "等待 IM 平台投递", variant: "ok" };
    case "session.created":
      return { title: "新会话已创建", detail: event.sessionId || "为该 IM 来源创建持久会话", action: "可继续复用上下文", variant: "ok" };
    case "session.killed":
      return { title: "会话已终止", detail: event.reason || event.sessionId || "手动或策略终止", action: "下次消息会重新创建", variant: "warn" };
    case "session.reaped":
      return { title: "空闲会话已回收", detail: event.reason || event.sessionId || "超过空闲策略", action: "无需处理", variant: "mute" };
    case "session.stopped":
    case "session.disposed":
      return { title: "会话已停止", detail: event.reason || event.sessionId || "会话生命周期结束", action: "无需处理", variant: "mute" };
    default:
      return { title: event.type, detail: event.reason || event.sessionId || "运行时事件", action: "只读证据", variant: EVENT_TONE[event.type] };
  }
}

function importantEvents(events: ChannelConnectorAgentSessionDriverRuntimeEvent[]) {
  const highSignal = events.filter((event) => event.error || event.type === "turn.failed" || event.type === "turn.fallback");
  const routine = events.filter((event) => !highSignal.includes(event));
  return [...highSignal, ...routine].slice(0, 12);
}

function sessionBadge(session: ChannelConnectorAgentSessionRuntimeStatus): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  if (session.lastError) return { variant: "bad", label: "异常" };
  if (session.running > 0) return { variant: "ok", label: "运行中" };
  return { variant: "mute", label: "空闲" };
}


function routeDefaultsForSession(
  session: ChannelConnectorAgentSessionRuntimeStatus,
  bindings: ChannelConnectorAgentSessionDriverBindingStatus[],
): ChannelConnectorAgentSessionDriverBindingStatus | null {
  return (
    bindings.find(
      (binding) =>
        binding.bindingId === session.bindingId &&
        binding.projectId === session.projectId,
    ) ??
    bindings.find((binding) => binding.bindingId === session.bindingId) ??
    null
  );
}

function valueOrDefault(value: string | null | undefined, fallback = "网关默认"): string {
  return value && value.trim() ? value : fallback;
}


function compactText(value: string | null | undefined, max = 42): string {
  const normalized = valueOrDefault(value, "—");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(12, max - 12))}…${normalized.slice(-8)}`;
}

function sessionDisplayTitle(
  session: ChannelConnectorAgentSessionRuntimeStatus,
  route: ChannelConnectorAgentSessionDriverBindingStatus | null,
): string {
  if (session.sessionControl?.sessionName) return session.sessionControl.sessionName;
  const platform = route?.platform || session.bindingId.split(":")[0] || "IM";
  const account = route?.accountId || route?.botId || "默认来源";
  return `${platform} · ${compactText(account, 28)}`;
}

function sessionSubtitle(
  session: ChannelConnectorAgentSessionRuntimeStatus,
  route: ChannelConnectorAgentSessionDriverBindingStatus | null,
): string {
  const binding = route?.bindingId || session.bindingId;
  return `${session.agent} · ${valueOrDefault(session.model)} · ${compactText(binding, 36)}`;
}

function routeSummary(route: ChannelConnectorAgentSessionDriverBindingStatus | null): string {
  if (!route) return "未匹配到绑定路由；请检查配置是否已同步到守护服务。";
  return `${route.agent} · ${valueOrDefault(route.model)} · ${valueOrDefault(route.permissionMode, "默认权限")} · ${valueOrDefault(route.workDir, "默认目录")}`;
}

function currentSessionSummary(session: ChannelConnectorAgentSessionRuntimeStatus): string {
  return `${session.agent} · ${valueOrDefault(session.model)} · ${valueOrDefault(session.permissionMode, "默认权限")} · ${valueOrDefault(session.workDir, "默认目录")}`;
}

function hasSessionOverride(
  session: ChannelConnectorAgentSessionRuntimeStatus,
  route: ChannelConnectorAgentSessionDriverBindingStatus | null,
): boolean {
  if (!route) return false;
  return (
    String(route.agent) !== session.agent ||
    (route.model ?? null) !== (session.model ?? null) ||
    (route.permissionMode ?? null) !== (session.permissionMode ?? null) ||
    route.workDir !== session.workDir
  );
}

function formatIdle(idleMs: number): string {
  if (idleMs < 1000) return `${idleMs}ms`;
  const s = Math.round(idleMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

export function SessionsView(_props: ChannelConnectorsViewProps) {
  const sessionsQuery = useChannelConnectorsAgentSessionsQuery();
  const configQuery = useChannelConnectorsConfigQuery();
  const manageMutation = useManageChannelConnectorsAgentSessionsMutation();
  const saveConfigMutation = useSaveChannelConnectorsConfigMutation();
  const restartDaemonMutation = useManageChannelConnectorsDaemonServiceMutation();

  const [confirm, setConfirm] = React.useState<
    | null
    | { kind: "reap" }
    | { kind: "kill"; session: ChannelConnectorAgentSessionRuntimeStatus }
    | { kind: "reset"; session: ChannelConnectorAgentSessionRuntimeStatus }
  >(null);
  const [evidence, setEvidence] = React.useState<string | null>(null);
  const [policyNotice, setPolicyNotice] = React.useState<null | { tone: "ok" | "warn" | "bad"; text: string }>(null);

  const data = sessionsQuery.data;
  const config = configQuery.data?.config ?? null;
  const policyConfig = config?.agentSessionPolicy;
  const activeSessions = data?.activeSessions ?? [];
  const routeBindings = data?.bindings ?? [];
  const recentEvents = data?.recentEvents ?? [];
  const visibleEvents = importantEvents(recentEvents);
  const policy = data?.policy;
  const defaultPolicy = React.useMemo(() => ({
    maxSessions: 8,
    maxConcurrentTurns: 4,
    idleTimeoutMs: 10 * 60_000,
    busyStrategy: "reject" as const,
    queueMaxRecords: 200,
    queueMaxAgeMs: 24 * 60 * 60_000,
  }), []);
  const persistedPolicy = policyConfig ?? defaultPolicy;
  const [policyDraft, setPolicyDraft] = React.useState(persistedPolicy);

  React.useEffect(() => {
    setPolicyDraft(policyConfig ?? defaultPolicy);
  }, [defaultPolicy, policyConfig]);

  const policyDirty = JSON.stringify(policyDraft) !== JSON.stringify(persistedPolicy);
  const runtimePolicyLoaded = Boolean(policy);
  const runtimeMatchesDraft = policy?.maxConcurrentTurns === policyDraft.maxConcurrentTurns
    && policy?.maxSessions === policyDraft.maxSessions
    && policy?.busyStrategy === policyDraft.busyStrategy
    && policy?.queueMaxRecords === policyDraft.queueMaxRecords;
  const policyBadge = !runtimePolicyLoaded
    ? { variant: "warn" as const, label: "守护未连接" }
    : policyDirty
      ? { variant: "warn" as const, label: "未保存" }
      : runtimeMatchesDraft
        ? { variant: "ok" as const, label: "运行中已同步" }
        : { variant: "warn" as const, label: "已保存，需重启" };
  const pending = manageMutation.isPending || saveConfigMutation.isPending || restartDaemonMutation.isPending;

  if (sessionsQuery.isLoading || configQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
      </div>
    );
  }

  const loadError = sessionsQuery.error ?? configQuery.error;
  if (loadError) {
    return (
      <ErrorState
        title="无法加载会话"
        description={loadError.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void sessionsQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const savePolicy = (restartAfterSave = false) => {
    if (!config) return;
    setPolicyNotice({ tone: "warn", text: restartAfterSave ? "正在保存策略并重启 IM 守护……" : "正在保存策略……" });
    saveConfigMutation.mutate(
      {
        config: {
          ...config,
          updatedAt: new Date().toISOString(),
          agentSessionPolicy: policyDraft,
        },
      },
      {
        onSuccess: (saved) => {
          const savedPolicy = saved.config.agentSessionPolicy ?? policyDraft;
          setPolicyDraft(savedPolicy);
          void configQuery.refetch();
          if (restartAfterSave) {
            setPolicyNotice({ tone: "warn", text: "策略已保存，正在重启 IM 守护并等待运行态刷新……" });
            restartDaemonMutation.mutate(
              { action: "restart", apply: true, runCommands: true },
              {
                onSuccess: () => {
                  setPolicyNotice({ tone: "ok", text: "已保存并重启 IM 守护；新的并发/队列策略已写入 daemon 配置。" });
                  toast.success("已保存并重启 IM 守护", { description: "新的全局并发/队列策略已写入 daemon 配置。" });
                  void sessionsQuery.refetch();
                  window.setTimeout(() => {
                    void sessionsQuery.refetch();
                  }, 1200);
                },
                onError: (error) => {
                  setPolicyNotice({ tone: "bad", text: `策略已保存，但重启失败：${error.message}` });
                  toast.error("保存成功，但重启失败", { description: error.message });
                },
              },
            );
            return;
          }
          setPolicyNotice({ tone: "ok", text: "策略已保存；点击“保存并重启”可立即让运行中 daemon 生效。" });
          toast.success("已保存 IM Agent 并发策略", { description: "点击“保存并重启”可立即让运行中 daemon 生效。" });
        },
        onError: (error) => {
          setPolicyNotice({ tone: "bad", text: `保存并发策略失败：${error.message}` });
          toast.error("保存并发策略失败", { description: error.message });
        },
      },
    );
  };

  const runReap = () => {
    manageMutation.mutate(
      { action: "reap-idle", reason: "manual-reap-from-web" },
      {
        onSuccess: (result) => {
          setEvidence(`已回收 ${result.reaped ?? 0} 个空闲会话`);
          toast.success("已回收空闲会话", { description: `reaped ${result.reaped ?? 0}` });
          void sessionsQuery.refetch();
        },
        onError: (error) => toast.error("回收失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };


  const runReset = (session: ChannelConnectorAgentSessionRuntimeStatus) => {
    manageMutation.mutate(
      {
        action: "reset-conversation",
        poolKey: session.poolKey,
        bindingId: session.bindingId,
        sessionKey: session.sessionKey,
        reason: "manual-reset-to-route-default-from-web",
      },
      {
        onSuccess: (result) => {
          const reset = result.reset;
          setEvidence(
            reset
              ? `已重置会话：override=${reset.controlsCleared ? "yes" : "no"}，Agent sessions=${reset.sessionsCleared}，history=${reset.historyCleared}，driver=${reset.killed ? "stopped" : "none"}`
              : `已请求重置会话 ${session.sessionId}`,
          );
          toast.success("已重置为默认路由", {
            description: "已清理该 IM 会话的覆盖、历史和持久 Agent session；下一条消息会按默认路由重新创建。",
          });
          void sessionsQuery.refetch();
        },
        onError: (error) => toast.error("重置失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  const runKill = (session: ChannelConnectorAgentSessionRuntimeStatus) => {
    manageMutation.mutate(
      { action: "kill", poolKey: session.poolKey, reason: "manual-kill-from-web" },
      {
        onSuccess: (result) => {
          const killed = result.killed?.killed === true;
          setEvidence(
            killed
              ? `已终止会话 ${result.killed?.sessionId ?? session.sessionId}`
              : `未找到匹配会话（${session.poolKey}）`,
          );
          if (killed) {
            toast.success("已终止会话", { description: session.sessionId });
          } else {
            toast.warning("未终止任何会话", { description: "会话可能已结束" });
          }
          void sessionsQuery.refetch();
        },
        onError: (error) => toast.error("终止失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <div className="grid gap-[18px]">
      <Panel>
        <PanelHead
          title="全局并发 / 队列策略"
          sub="针对不同 IM 会话的 Agent turn。maxConcurrentTurns 是真正的同时执行上限；超过后按策略拒绝或排队。"
          action={<Badge variant={policyBadge.variant}>{policyBadge.label}</Badge>}
        />
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink-strong">最大同时执行</span>
            <input className="h-9 rounded-sm border border-line bg-panel-2 px-2" type="number" min={1} max={128} value={policyDraft.maxConcurrentTurns} onChange={(e) => setPolicyDraft((draft) => ({ ...draft, maxConcurrentTurns: Number(e.target.value) || 1 }))} />
            <span className="text-xs text-subtle">不同会话竞争这个全局槽位。</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink-strong">持久会话缓存</span>
            <input className="h-9 rounded-sm border border-line bg-panel-2 px-2" type="number" min={1} max={128} value={policyDraft.maxSessions} onChange={(e) => setPolicyDraft((draft) => ({ ...draft, maxSessions: Number(e.target.value) || 1 }))} />
            <span className="text-xs text-subtle">空闲 session 保留上限，不等于并发。</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink-strong">超出策略</span>
            <select className="h-9 rounded-sm border border-line bg-panel-2 px-2" value={policyDraft.busyStrategy} onChange={(e) => setPolicyDraft((draft) => ({ ...draft, busyStrategy: e.target.value === "queue" ? "queue" : "reject" }))}>
              <option value="reject">直接拒绝</option>
              <option value="queue">进入 FIFO 队列</option>
            </select>
            <span className="text-xs text-subtle">队列只限制不同会话的全局竞争。</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink-strong">队列容量</span>
            <input className="h-9 rounded-sm border border-line bg-panel-2 px-2" type="number" min={0} max={5000} value={policyDraft.queueMaxRecords} onChange={(e) => setPolicyDraft((draft) => ({ ...draft, queueMaxRecords: Number(e.target.value) || 0 }))} />
            <span className="text-xs text-subtle">超过容量会拒绝新任务。</span>
          </label>
        </div>
        {policyNotice && (
          <div
            className={
              policyNotice.tone === "ok"
                ? "border-t border-line bg-green-soft px-4 py-2.5 text-sm text-green"
                : policyNotice.tone === "bad"
                  ? "border-t border-line bg-red-soft px-4 py-2.5 text-sm text-red"
                  : "border-t border-line bg-amber-soft px-4 py-2.5 text-sm text-amber"
            }
            role="status"
          >
            {policyNotice.text}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-sm text-muted">
          <span>当前执行中 {policy?.activeTurns ?? 0}，队列中 {policy?.queuedTurns ?? 0}；运行策略 {policy?.maxConcurrentTurns ?? "—"} 并发 / {policy?.busyStrategy === "queue" ? "队列" : "拒绝"}。</span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pending || !policyDirty} onClick={() => setPolicyDraft(persistedPolicy)}>撤销</Button>
            <Button variant="outline" size="sm" disabled={pending || !policyDirty} onClick={() => savePolicy(false)}>保存策略</Button>
            <Button variant="primary" size="sm" disabled={pending || (!policyDirty && runtimeMatchesDraft)} onClick={() => savePolicy(true)}>保存并重启</Button>
          </span>
        </div>
      </Panel>

      {/* Active sessions — read-only with guarded controls */}
      <Panel>
        <PanelHead
          title="会话投递"
          sub="IM 触发的 Agent session 与投递链路证据；kill / reap 为写操作，需确认。"
          action={
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {activeSessions.length}
                {policy ? `/${policy.maxSessions}` : ""} 活跃
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm({ kind: "reap" })}
                disabled={pending}
              >
                <Recycle />
                回收空闲
              </Button>
            </div>
          }
        />
        {activeSessions.length === 0 ? (
          <EmptyState
            title="暂无活跃会话"
            description="私聊/群聊触发 Agent 后会在这里显示持久会话。"
            icon={<MessageSquare />}
          />
        ) : (
          <div className="grid gap-2 p-3">
            {activeSessions.map((session, index) => {
              const badge = sessionBadge(session);
              const routeDefault = routeDefaultsForSession(session, routeBindings);
              const sessionOverridden = hasSessionOverride(session, routeDefault);
              const title = sessionDisplayTitle(session, routeDefault);
              const subtitle = sessionSubtitle(session, routeDefault);
              return (
                <div
                  key={`${session.poolKey}-${session.sessionId}-${index}`}
                  className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                      <MessageSquare />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <strong className="truncate text-base text-ink-strong">
                        {title}
                      </strong>
                      <span className="truncate text-sm text-muted">{subtitle}</span>
                      <span className="truncate font-mono text-[11px] text-subtle" title={session.poolKey}>
                        技术标识 · {compactText(session.sessionId || session.poolKey, 72)}
                      </span>
                    </span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {session.sessionControl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber hover:bg-amber-soft"
                        onClick={() => setConfirm({ kind: "reset", session })}
                        disabled={pending}
                      >
                        <Recycle />
                        重置为默认
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red hover:bg-red-soft"
                      onClick={() => setConfirm({ kind: "kill", session })}
                      disabled={pending}
                    >
                      <XCircle />
                      终止
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">turns {session.turnCount}</Badge>
                    <Badge variant="outline">running {session.running}</Badge>
                    <Badge variant="outline">idle {formatIdle(session.idleMs)}</Badge>
                    <Badge variant="outline">用于 {formatTime(session.lastUsedAt)}</Badge>
                    {routeDefault && (
                      <Badge variant={sessionOverridden ? "warn" : "ok"}>
                        {sessionOverridden ? "会话覆盖" : "跟随路由"}
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-1 rounded-sm border border-line bg-panel px-3 py-2 text-xs text-muted">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">默认路由</Badge>
                      <span className="min-w-0 break-words">
                        {routeSummary(routeDefault)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={sessionOverridden ? "warn" : "outline"}>当前会话</Badge>
                      <span className="min-w-0 break-words">
                        {currentSessionSummary(session)}
                      </span>
                    </div>
                    {session.sessionControl?.lastCommand && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="info">最后命令</Badge>
                        <code className="min-w-0 break-all rounded-sm bg-panel-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-strong">
                          {session.sessionControl.lastCommand}
                        </code>
                        <span className="text-subtle">{formatTime(session.sessionControl.updatedAt)}</span>
                      </div>
                    )}
                    {session.sessionControl?.sessionName && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">会话名</Badge>
                        <span className="min-w-0 break-words">{session.sessionControl.sessionName}</span>
                      </div>
                    )}
                    {sessionOverridden && (
                      <span className="text-amber">
                        该会话已通过 IM 命令或运行时状态覆盖默认路由；后续消息会继续复用当前会话配置，直到会话终止或重置。
                      </span>
                    )}
                  </div>
                  {session.lastError && (
                    <p className="flex items-start gap-1.5 text-xs text-red">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {session.lastError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {evidence && (
          <div className="border-t border-line px-4 py-2.5">
            <span className="text-sm text-muted">{evidence}</span>
          </div>
        )}
      </Panel>

      {/* Recent events — human-readable trace */}
      <Panel>
        <PanelHead
          title="需要关注的会话事件"
          sub="失败和 fallback 优先；原始事件类型保留为小标签，便于排查但不占主视觉。"
        />
        {recentEvents.length === 0 ? (
          <EmptyState title="暂无事件" description="尚无 session / turn 事件记录。" />
        ) : (
          <div className="grid gap-2 p-3">
            {visibleEvents.map((event, index) => {
              const view = humanEvent(event);
              return (
                <div
                  key={`${event.type}-${event.sessionId ?? "none"}-${index}`}
                  className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                    <Activity />
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <strong className="truncate text-base text-ink-strong">{view.title}</strong>
                    <span className="break-words text-sm text-muted">{view.detail}</span>
                    <span className="truncate text-xs text-subtle">
                      {event.agent} · {event.bindingId} · {formatTime(event.checkedAt)} · {view.action}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-start gap-1.5 sm:justify-end">
                    <Badge variant={view.variant}>{view.variant === "bad" ? "需处理" : view.variant === "warn" ? "关注" : "正常"}</Badge>
                    <Badge variant="outline">{event.type}</Badge>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Reap confirmation */}
      <Dialog open={confirm?.kind === "reap"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <Recycle />
            </span>
            <DialogTitle>回收空闲会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            将按空闲超时策略回收闲置的持久会话。正在运行的会话不受影响。确认回收？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={runReap} disabled={pending}>
              {pending ? "回收中…" : "确认回收"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Reset confirmation */}
      <Dialog open={confirm?.kind === "reset"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <Recycle />
            </span>
            <DialogTitle>重置为默认路由</DialogTitle>
          </DialogHeader>
          <DialogBody>
            这会清理该 IM 会话的 override、Agent session 续接记录和本地 conversation history，并终止当前持久 driver。下一条消息会按绑定路由默认 Agent、模型、目录和权限重新创建。
            {confirm?.kind === "reset" && (
              <code className="mt-2 block rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
                {confirm.session.bindingId} · {confirm.session.sessionKey}
              </code>
            )}
            确认重置？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => confirm?.kind === "reset" && runReset(confirm.session)}
              disabled={pending}
            >
              {pending ? "重置中…" : "确认重置为默认路由"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kill confirmation */}
      <Dialog open={confirm?.kind === "kill"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>终止会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            终止会立即结束该持久会话进程，正在进行的回合会被中断。
            {confirm?.kind === "kill" && (
              <code className="mt-2 block rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
                {confirm.session.sessionId} · {confirm.session.poolKey}
              </code>
            )}
            确认终止？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => confirm?.kind === "kill" && runKill(confirm.session)}
              disabled={pending}
            >
              {pending ? "终止中…" : "确认终止"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
