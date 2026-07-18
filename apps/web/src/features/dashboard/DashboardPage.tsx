import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
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
import { MetricRail, MetricTile, type MetricTone } from "@/design/ui/metric";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";

import { isGatewayExposure } from "@/lib/runtime";

import type {
  AttentionIconKey,
  AttentionItem,
  AttentionSeverity,
  QuickLaunchEntry,
  ReadinessTone,
} from "./types";
import { Panel, PanelHead, Row, formatTime } from "@/design/ui/panel";
import { ToneBadge } from "./views/_shared";
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

/** Aggregate readiness tone → MetricTile tone (info/mute stay neutral). */
const METRIC_TONE: Record<ReadinessTone, MetricTone> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "default",
  mute: "default",
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

/** Banner verdict: does the operator need to act right now? */
type BannerState = "ok" | "warn" | "bad" | "pending";

/** Status-banner tone per verdict (semantic tokens only). */
const BANNER_TONE: Record<BannerState, { shell: string; chip: string }> = {
  ok: {
    shell: "border-success-line bg-success-soft",
    chip: "bg-panel text-success",
  },
  warn: {
    shell: "border-warning-line bg-warning-soft",
    chip: "bg-panel text-warning",
  },
  bad: {
    shell: "border-danger-line bg-danger-soft",
    chip: "bg-panel text-danger",
  },
  pending: {
    shell: "border-line bg-panel",
    chip: "bg-panel-3 text-muted",
  },
};

const BANNER_ICON: Record<
  BannerState,
  React.ComponentType<{ className?: string }>
> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: ShieldAlert,
  pending: CircleDot,
};

/** Feed dot color per readiness tone (semantic tokens only). */
const FEED_DOT: Record<ReadinessTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  info: "bg-primary",
  mute: "bg-subtle",
};

/**
 * Dashboard — an attention-first home. It aggregates live runtime state from
 * across the owning domains (model gateway, IM channels, recovery, terminal,
 * system) into one screen that answers "what needs my attention right now,
 * and what's the next step?" — then DEEP-LINKS to the owning domain for every
 * action. The cockpit itself is read-only: it never writes.
 *
 * Hierarchy: full-width status banner ("需要我动手吗？" — verdict + top
 * problem + action) → health MetricRail → 2-col grid (left: attention queue +
 * quick launch; right: in-progress work + recent activity feed). No SSE —
 * refresh is TanStack Query polling plus a manual refresh control.
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
  const hydrationLabel = isBootstrapping
    ? "正在读取轻量摘要"
    : secondarySourcesEnabled
      ? isFetching
        ? "正在更新"
        : "实时状态已更新"
      : "基础状态已就绪，详细检测进行中";
  const releaseVersion =
    summary?.server.version ?? sources.health.data?.version;
  const gatewayExposure = isGatewayExposure();

  // The banner verdict — the first thing on the page answers "需要我动手吗？".
  const topAttention: AttentionItem | null = attention[0] ?? null;
  const bannerState: BannerState =
    readiness.tone === "bad" || topAttention?.severity === "high"
      ? "bad"
      : readiness.tone === "warn" || topAttention
        ? "warn"
        : readiness.tone === "ok"
          ? "ok"
          : "pending";
  const bannerTone = BANNER_TONE[bannerState];
  const BannerIcon = BANNER_ICON[bannerState];
  const bannerHeadline =
    bannerState === "ok"
      ? "一切正常"
      : topAttention
        ? topAttention.title
        : bannerState === "pending"
          ? "正在读取运行状态"
          : readiness.label;
  const bannerCopy = topAttention
    ? topAttention.detail
    : "汇总模型路由、消息接入、平台守护与 Agent CLI 的运行状态；较慢的检测在后台自动补齐，不影响当前操作。";

  return (
    <div className="grid gap-[18px]">
      {/* ---- 状态横幅 — 需要我动手吗？（首屏第一优先级） ----------------- */}
      <section
        className={cn(
          "rounded-md border p-4 shadow-sm sm:p-5",
          bannerTone.shell,
        )}
      >
        <div className="flex flex-wrap items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-[10px] [&_svg]:size-5",
              bannerTone.chip,
            )}
          >
            <BannerIcon />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-2xs font-semibold uppercase tracking-wider text-subtle">
              工作台 · 运行状态总览
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink-strong">
                {bannerHeadline}
              </h1>
              <ToneBadge tone={readiness.tone}>
                <CircleDot className="size-3.5" />
                {readiness.label}
              </ToneBadge>
            </div>
            <p className="mt-1 text-sm text-muted">{bannerCopy}</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
              <Badge variant={gatewayExposure ? "info" : "mute"}>
                {gatewayExposure ? "OpenClaw 网关接入" : "独立运行"}
              </Badge>
              {releaseVersion && <span>v{releaseVersion}</span>}
              <span aria-live="polite">{hydrationLabel}</span>
              {checkedAt && <span>更新于 {formatTime(checkedAt)}</span>}
            </div>
            {topAttention && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-panel"
                  onClick={() => navigate(topAttention.to)}
                >
                  {topAttention.actionLabel}
                  <ArrowRight />
                </Button>
                {attention.length > 1 && (
                  <span className="text-xs text-subtle">
                    还有 {attention.length - 1} 项待处理，见下方关注队列
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-panel"
            onClick={refetchAll}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("size-3.5", isFetching && "animate-spin")}
            />
            刷新
          </Button>
        </div>
      </section>

      {/* ---- 关键健康指标 — one tile per readiness pillar, deep-links. --- */}
      <MetricRail aria-label="关键健康指标">
        {pillars.map((pillar) => (
          <MetricTile
            key={pillar.id}
            label={pillar.label}
            value={pillar.value}
            hint={pillar.detail}
            tone={METRIC_TONE[pillar.tone]}
            role="link"
            tabIndex={0}
            onClick={() => navigate(pillar.to)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(pillar.to);
              }
            }}
            className="cursor-pointer transition-colors hover:border-primary-line focus-visible:shadow-[var(--ring)]"
          />
        ))}
      </MetricRail>

      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <div className="grid gap-[18px]">
          {/* ---- 关注队列 (attention-first core) ------------------------- */}
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
                    ? "当前没有从运行状态综合出的待处理事项。"
                    : "摘要和入口已可用；较慢的后台检测将在稍后自动补齐。"
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
                          ? "bg-danger-soft text-danger"
                          : item.severity === "medium"
                            ? "bg-warning-soft text-warning"
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

          {/* ---- 快速启动 ------------------------------------------------ */}
          <Panel>
            <PanelHead title="快速启动" sub="进入关键工作域" />
            <div className="grid gap-2 p-3">
              {QUICK_LAUNCH.map((entry) => {
                const Icon = QUICK_LAUNCH_ICON[entry.icon];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => navigate(entry.to)}
                    className="group flex items-center gap-3 rounded-sm border border-line bg-panel-2 p-3 text-left outline-none transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:border-line-2 hover:bg-panel-3 focus-visible:shadow-[var(--ring)]"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted transition-colors duration-[var(--dur-1)] group-hover:bg-primary-soft group-hover:text-primary [&_svg]:size-4">
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
                    <ArrowRight className="ml-auto size-4 shrink-0 text-subtle opacity-0 transition-[opacity,transform] duration-[var(--dur-1)] ease-[var(--ease-standard)] group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="grid gap-[18px]">
          {/* ---- 正在进行 (read-only) ----------------------------------- */}
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

          {/* ---- 近期动态 — compact activity feed ------------------------ */}
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
              <ol className="grid px-4 py-3">
                {recentActivity.map((item, index) => (
                  <li key={item.id} className="flex gap-3">
                    <span
                      aria-hidden
                      className="flex w-2 shrink-0 flex-col items-center"
                    >
                      <span
                        className={cn(
                          "mt-[7px] size-2 shrink-0 rounded-full",
                          FEED_DOT[item.tone],
                        )}
                      />
                      {index < recentActivity.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-line" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 pb-4">
                      <div className="flex items-baseline gap-2">
                        <strong className="truncate text-base text-ink-strong">
                          {item.title}
                        </strong>
                        {item.occurredAt && (
                          <span className="ml-auto shrink-0 text-2xs text-subtle">
                            {formatTime(item.occurredAt)}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
