import * as React from "react";
import {
  ArrowRight,
  Bot,
  CircleSlash,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  MessageSquare,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useAgentDetailQuery, useAgentsSummaryQuery } from "@/lib/query/agents";

import type { CliAgentsViewProps } from "../types";
import {
  Fact,
  Panel,
  PanelHead,
  Row,
  ToneBadge,
  formatCompact,
  formatTime,
  toneIconClass,
} from "./_shared";

/** Persona detail pane — read-only profile, runtime, bindings, sessions. */
function PersonaDetail({ agentId }: { agentId: string }) {
  const detail = useAgentDetailQuery(agentId);

  if (detail.isLoading) {
    return (
      <div className="grid gap-2 p-4">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (detail.error) {
    return (
      <ErrorState
        title="无法加载 persona 详情"
        description={detail.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
            重试
          </Button>
        }
      />
    );
  }
  const data = detail.data;
  if (!data) {
    return <EmptyState title="未选择 persona" />;
  }

  const { agent, bindings, recentSessions, sessions, docs } = data;
  const { identity, runtime } = agent;

  return (
    <div className="grid gap-4 p-4">
      {/* Identity header */}
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-xl">
          {identity.emoji || "🤖"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-md font-semibold text-ink-strong">
              {identity.name || agent.name}
            </h3>
            <ToneBadge tone={agent.enabled ? "ok" : "mute"}>
              {agent.enabled ? "已启用" : "已停用"}
            </ToneBadge>
            {agent.isDefault && <ToneBadge tone="info">默认</ToneBadge>}
          </div>
          <p className="truncate text-sm text-muted">
            {identity.role || "—"} · {agent.id}
          </p>
          {identity.mission && (
            <p className="mt-1 line-clamp-2 text-sm text-subtle">{identity.mission}</p>
          )}
        </div>
      </div>

      {/* Model routing — read-only reference, deep-links to gateway */}
      <div className="grid gap-2 rounded-md border border-line bg-panel-2 p-3">
        <div className="flex items-center gap-2">
          <RouteIcon className="size-4 text-primary" />
          <span className="text-sm font-medium text-ink-strong">模型路由（只读）</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => (window.location.hash = "#/model-gateway")}
          >
            模型网关
            <ExternalLink />
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact label="模型">{agent.model || "—"}</Fact>
          <Fact label="运行时">{runtime.type}</Fact>
          <Fact label="后端">{runtime.backend || "—"}</Fact>
        </dl>
        <p className="text-xs text-subtle">
          模型与路由的更改在模型网关进行，本页不修改。
        </p>
      </div>

      {/* Profile / permissions facts */}
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Fact label="工作目录">{agent.workspace || "—"}</Fact>
        <Fact label="沙箱">{agent.sandboxMode || "—"}</Fact>
        <Fact label="工作区访问">{agent.workspaceAccess || "—"}</Fact>
        <Fact label="工具配置">{agent.toolsProfile || "—"}</Fact>
        <Fact label="仅限工作区文件">{agent.fsWorkspaceOnly ? "是" : "否"}</Fact>
        <Fact label="推理默认">{agent.reasoningDefault || "—"}</Fact>
      </dl>

      {/* Rolled-up counters */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="grid gap-0.5 rounded-md border border-line bg-panel-2 p-3">
          <span className="flex items-center gap-1.5 text-xs text-subtle">
            <MessageSquare className="size-3.5" />
            会话
          </span>
          <span className="text-lg font-semibold text-ink-strong">{sessions.count}</span>
        </div>
        <div className="grid gap-0.5 rounded-md border border-line bg-panel-2 p-3">
          <span className="flex items-center gap-1.5 text-xs text-subtle">
            <KeyRound className="size-3.5" />
            Token
          </span>
          <span className="text-lg font-semibold text-ink-strong">
            {formatCompact(sessions.totalTokens)}
          </span>
        </div>
        <div className="grid gap-0.5 rounded-md border border-line bg-panel-2 p-3">
          <span className="flex items-center gap-1.5 text-xs text-subtle">
            <Link2 className="size-3.5" />
            绑定
          </span>
          <span className="text-lg font-semibold text-ink-strong">{bindings.length}</span>
        </div>
      </div>

      {/* Bindings (read-only) */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted" />
          <span className="text-sm font-medium text-ink-strong">渠道绑定</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => (window.location.hash = "#/im-channels?view=bindings")}
          >
            IM 渠道
            <ExternalLink />
          </Button>
        </div>
        {bindings.length === 0 ? (
          <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-subtle">
            无渠道绑定。
          </p>
        ) : (
          <div className="grid gap-0.5 rounded-md border border-line bg-panel-2 p-1">
            {bindings.slice(0, 8).map((b) => (
              <Row
                key={b.id}
                icon={<Link2 />}
                title={b.label || b.ref || b.id}
                subtitle={`${b.channel} · ${b.peerKind || "—"} · ${b.mode || "—"}`}
                trailing={<ToneBadge tone="info">{b.type}</ToneBadge>}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent sessions (read-only) */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted" />
          <span className="text-sm font-medium text-ink-strong">最近会话</span>
        </div>
        {recentSessions.length === 0 ? (
          <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-subtle">
            无最近会话记录。
          </p>
        ) : (
          <div className="grid gap-0.5 rounded-md border border-line bg-panel-2 p-1">
            {recentSessions.slice(0, 8).map((s) => (
              <Row
                key={s.id}
                icon={<MessageSquare />}
                title={s.sessionId || s.id}
                subtitle={`${s.model || "—"} · ${s.chatType || "—"} · ${formatTime(s.updatedAt)}`}
                trailing={
                  <span className="text-xs text-muted">{formatCompact(s.totalTokens)} tok</span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Persona docs (existence only) */}
      {docs.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted" />
            <span className="text-sm font-medium text-ink-strong">Persona 文档</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <span
                key={d.name}
                className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs ${
                  d.exists
                    ? "border-line bg-panel-2 text-ink"
                    : "border-line bg-panel-3 text-subtle"
                }`}
              >
                {d.exists ? <FileText className="size-3" /> : <CircleSlash className="size-3" />}
                {d.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Persona / agent list + detail. The list is read-only; selecting a persona
 * deep-links into its detail (`?agent=`). Model routing is referenced read-only
 * and links to the model gateway. No persona authoring happens here.
 */
export function PersonasView({ goToView, selectedAgent }: CliAgentsViewProps) {
  const agents = useAgentsSummaryQuery();
  const agentRows = agents.data?.agents ?? [];

  // Auto-select the first agent (or default) when none is chosen.
  const resolvedSelection =
    selectedAgent ??
    agents.data?.defaultAgentId ??
    agentRows[0]?.id ??
    null;

  React.useEffect(() => {
    if (!selectedAgent && resolvedSelection) {
      goToView("personas", { agent: resolvedSelection });
    }
  }, [selectedAgent, resolvedSelection, goToView]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* List */}
      <Panel className="self-start">
        <PanelHead
          title="Persona 代理"
          sub={`${agentRows.length} 个代理 · 只读`}
        />
        <div className="grid gap-0.5 p-1">
          {agents.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : agents.error ? (
            <ErrorState
              title="无法加载代理"
              description={agents.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void agents.refetch()}>
                  重试
                </Button>
              }
            />
          ) : agentRows.length === 0 ? (
            <EmptyState title="暂无 persona 代理" />
          ) : (
            agentRows.map((a) => {
              const active = a.id === resolvedSelection;
              return (
                <Row
                  key={a.id}
                  icon={<Bot />}
                  iconClass={
                    active
                      ? "bg-primary-soft text-primary"
                      : toneIconClass(a.enabled ? "ok" : "mute")
                  }
                  title={a.name || a.id}
                  subtitle={`${a.identity.role || "—"} · ${formatCompact(a.totalTokens)} tok`}
                  trailing={
                    active ? (
                      <ArrowRight className="size-4 text-primary" />
                    ) : (
                      <ToneBadge tone={a.enabled ? "ok" : "mute"}>
                        {a.enabled ? "启用" : "停用"}
                      </ToneBadge>
                    )
                  }
                  onClick={() => goToView("personas", { agent: a.id })}
                />
              );
            })
          )}
        </div>
      </Panel>

      {/* Detail */}
      <Panel className="self-start">
        {resolvedSelection ? (
          <>
            <PanelHead
              title="Persona 详情"
              sub="只读；模型路由跳转至网关。"
            />
            <PersonaDetail agentId={resolvedSelection} />
          </>
        ) : (
          <EmptyState title="选择一个 persona 查看详情" icon={<Bot />} />
        )}
      </Panel>
    </div>
  );
}

export default PersonasView;
