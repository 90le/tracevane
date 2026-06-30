import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Boxes,
  CheckCircle2,
  CircleDot,
  LifeBuoy,
  Network,
  Plug,
  RadioTower,
  RefreshCw,
  Server,
  ShieldAlert,
  Terminal,
  Wrench,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";

import type {
  AttentionIconKey,
  AttentionSeverity,
  QuickLaunchEntry,
} from "./types";
import {
  Panel,
  PanelHead,
  Row,
  ToneBadge,
  formatTime,
  toneIconClass,
} from "./views/_shared";
import { ROUTES } from "./views/aggregate";
import { useDashboardAggregate } from "./views/useDashboardAggregate";

/** Cockpit auto-refresh cadence — refetch (NOT SSE), generous to avoid churn. */
const REFRESH_INTERVAL_MS = 20_000;

const ATTENTION_ICON: Record<
  AttentionIconKey,
  React.ComponentType<{ className?: string }>
> = {
  gateway: Plug,
  channel: Network,
  recovery: LifeBuoy,
  system: Server,
  bootstrap: Wrench,
};

const QUICK_LAUNCH_ICON: Record<
  QuickLaunchEntry["icon"],
  React.ComponentType<{ className?: string }>
> = {
  gateway: Plug,
  channel: RadioTower,
  recovery: LifeBuoy,
  system: Server,
  bootstrap: Wrench,
  ide: Boxes,
};

const SEVERITY_BADGE: Record<
  AttentionSeverity,
  { variant: "bad" | "warn" | "mute"; label: string }
> = {
  high: { variant: "bad", label: "高" },
  medium: { variant: "warn", label: "中" },
  low: { variant: "mute", label: "低" },
};

const QUICK_LAUNCH: QuickLaunchEntry[] = [
  {
    id: "model-gateway",
    label: "模型路由",
    detail: "Provider / 路由 / 用量",
    icon: "gateway",
    to: ROUTES.modelGateway,
  },
  {
    id: "im-channels",
    label: "消息接入",
    detail: "绑定 / 会话 / 守护进程",
    icon: "channel",
    to: ROUTES.imChannels,
  },
  {
    id: "cli-agents",
    label: "Agent CLI",
    detail: "安装 / 配置 / 修复",
    icon: "system",
    to: ROUTES.cliAgents,
  },
];

/**
 * Dashboard — a task-first live operations cockpit. It aggregates live runtime
 * state from across the owning domains (model gateway, IM channels, recovery,
 * terminal, system) into one screen that answers "can the operator work
 * right now, and what's the next step?" — then DEEP-LINKS to the owning domain
 * for every action. The cockpit itself is read-only: it never writes.
 *
 * No SSE — refresh is TanStack Query polling plus a manual refresh control.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const {
    readiness,
    pillars,
    attention,
    activeWork,
    recentActivity,
    summary,
    isBootstrapping,
    secondarySourcesEnabled,
    isFetching,
    allFailed,
    error,
    refetchAll,
    sources,
  } = useDashboardAggregate();

  // Poll while mounted; pause when the tab is hidden (handled by TanStack).
  React.useEffect(() => {
    const id = window.setInterval(() => refetchAll(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refetchAll]);

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载运行态总览"
        description={error?.message ?? "所有聚合来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  const checkedAt =
    summary?.checkedAt ?? sources.health.data?.checkedAt ?? null;
  const hydrationLabel = secondarySourcesEnabled
    ? isFetching
      ? "正在更新"
      : "实时来源已补齐"
    : "首屏已就绪，后台检测排队中";
  const releaseVersion =
    summary?.server.version ?? sources.health.data?.version;

  return (
    <div className="grid gap-[18px]">
      {/* ---- Hero: 现在能不能工作 ---------------------------------------- */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <ToneBadge tone={readiness.tone}>
            <CircleDot className="size-3.5" />
            {readiness.label}
          </ToneBadge>
          <span className="text-sm text-muted">
            {isBootstrapping
              ? "正在读取轻量摘要"
              : readiness.attentionCount > 0
                ? `${readiness.attentionCount} 项需要关注`
                : "暂无需要关注的事项"}
          </span>
          {releaseVersion && (
            <span className="text-sm text-subtle">v{releaseVersion}</span>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-subtle">
            <span>{hydrationLabel}</span>
            {checkedAt && <span>更新于 {formatTime(checkedAt)}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={refetchAll}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn("size-3.5", isFetching && "animate-spin")}
              />
              刷新
            </Button>
          </span>
        </div>

        <p className="mt-3 text-base text-ink-strong">
          一个屏幕看清 Agent 工作是否能继续推进。
        </p>
        <p className="mt-1 text-sm text-muted">
          首屏先展示导航、关键入口和静态驾驶舱；网关、消息、平台守护与
          Agent CLI 状态随后补齐，不再让慢探测挡住 Dashboard。
        </p>

        {/* Readiness pillars — one glance, each deep-links to its domain. */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pillars.map((pillar) => (
            <button
              key={pillar.id}
              type="button"
              onClick={() => navigate(pillar.to)}
              className="rounded-sm border border-line bg-panel p-3 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-subtle">{pillar.label}</span>
                <ToneBadge tone={pillar.tone}>{pillar.value}</ToneBadge>
              </div>
              <div className="mt-1.5 truncate text-sm text-muted">
                {pillar.detail}
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ---- 关注队列 / 下一步 (task-first core) ---------------------- */}
        <Panel>
          <PanelHead
            title="关注队列 · 下一步"
            sub="从实时状态综合，点击前往对应域处理"
            action={
              <Badge variant={attention.length > 0 ? "warn" : "ok"}>
                {attention.length} 项
              </Badge>
            }
          />
          {attention.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 />}
              title={secondarySourcesEnabled ? "一切就绪" : "正在补齐后台检测"}
              description={
                secondarySourcesEnabled
                  ? "当前没有从运行态综合出的待处理事项。"
                  : "摘要和入口已可用；较慢的 owner-domain 探测将在首屏后补齐。"
              }
            />
          ) : (
            <div className="py-1.5">
              {attention.map((item) => {
                const Icon = ATTENTION_ICON[item.icon];
                const sev = SEVERITY_BADGE[item.severity];
                return (
                  <Row
                    key={item.id}
                    icon={<Icon />}
                    iconClass={
                      item.severity === "high"
                        ? "bg-red-soft text-red"
                        : item.severity === "medium"
                          ? "bg-amber-soft text-amber"
                          : "bg-panel-3 text-muted"
                    }
                    title={item.title}
                    subtitle={item.detail}
                    trailing={
                      <span className="flex items-center gap-2">
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(item.to)}
                        >
                          {item.actionLabel}
                        </Button>
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
        </Panel>

        {/* ---- 正在进行 (read-only) ------------------------------------ */}
        <Panel>
          <PanelHead
            title="正在进行"
            sub="活跃 IM Agent 会话与任务监督（只读）"
            action={<Badge variant="mute">{activeWork.length}</Badge>}
          />
          {activeWork.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title={secondarySourcesEnabled ? "暂无进行中的工作" : "正在检查进行中的工作"}
              description={
                secondarySourcesEnabled
                  ? "没有活跃的渠道 Agent 会话。"
                  : "活跃会话会在消息接入状态返回后显示；现在可以先进入关键工作域。"
              }
            />
          ) : (
            <div className="py-1.5">
              {activeWork.map((item) => (
                <Row
                  key={item.id}
                  icon={<Terminal />}
                  iconClass="bg-primary-soft text-primary"
                  title={item.title}
                  subtitle={item.detail}
                  onClick={() => navigate(item.to)}
                  trailing={<Badge variant="info">运行中</Badge>}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ---- 快速启动 / 继续 -------------------------------------------- */}
      <Panel>
        <PanelHead title="快速启动" sub="进入关键工作域" />
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LAUNCH.map((entry) => {
            const Icon = QUICK_LAUNCH_ICON[entry.icon];
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => navigate(entry.to)}
                className="flex items-center gap-3 rounded-sm border border-line bg-panel p-3 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                  <Icon />
                </span>
                <span className="grid min-w-0">
                  <strong className="truncate text-base text-ink-strong">
                    {entry.label}
                  </strong>
                  <span className="truncate text-sm text-muted">
                    {entry.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ---- 近期动态 --------------------------------------------------- */}
      <Panel>
        <PanelHead
          title="近期动态"
          sub="来自平台守护事件、运行摘要与渠道驱动"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(ROUTES.recovery)}
            >
              <LifeBuoy className="size-3.5" />
              平台守护日志
            </Button>
          }
        />
        {recentActivity.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert />}
            title="暂无近期动态"
            description="聚合来源未报告可展示的最近事件。"
          />
        ) : (
          <div className="py-1.5">
            {recentActivity.map((item) => (
              <Row
                key={item.id}
                icon={<CircleDot />}
                iconClass={toneIconClass(item.tone)}
                title={item.title}
                subtitle={item.detail}
                trailing={
                  item.occurredAt ? (
                    <span className="text-xs text-subtle">
                      {formatTime(item.occurredAt)}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
