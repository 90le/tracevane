import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Boxes, Globe, RadioTower, Route, Server, ShieldCheck } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import type { PlatformCard, PlatformTone } from "../types";
import { EvidenceRow, Panel, PanelHead, StatTile, ToneBadge } from "../_shared";
import { usePlatformsAggregate } from "../usePlatformsAggregate";

function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function RelatedDomainRow({
  icon: Icon,
  title,
  desc,
  status,
  tone,
  to,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  status: string;
  tone: PlatformTone;
  to: string;
  cta: string;
}) {
  return (
    <div className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
          <Icon />
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-base text-ink-strong">{title}</strong>
          <span className="block text-sm text-muted">{desc}</span>
        </span>
      </div>
      <ToneBadge tone={tone}>{status}</ToneBadge>
      <Button variant="ghost" size="sm" asChild>
        <Link to={to}>
          {cta}
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

function PlatformDirectoryRow({ card }: { card: PlatformCard }) {
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-panel-3 text-muted [&_svg]:size-5">
          <Server />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-ink-strong">{card.title}</h3>
            <ToneBadge tone={card.tone}>{card.status}</ToneBadge>
            <Badge variant="mute">底层平台</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{card.category}</p>
          <p className="mt-2 text-base text-ink-strong">{card.summary}</p>
        </div>
      </div>
      <div className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
        {card.boundary}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button size="sm" asChild>
          <Link to={card.primary.to}>
            {card.primary.label}
            <ArrowRight />
          </Link>
        </Button>
        {card.secondary && (
          <Button variant="outline" size="sm" asChild>
            <Link to={card.secondary.to}>{card.secondary.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Platform directory. This page is NOT a card wall: it lists real third-party
 * platforms first, then shows Tracevane owner-domain handoffs separately.
 */
export function OverviewView() {
  const { cards, isLoading, allFailed, error, refetchAll, sources } = usePlatformsAggregate();

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[120px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载平台目录"
        description={error?.message ?? "所有平台来源均不可用。"}
        action={<Button variant="outline" size="sm" onClick={refetchAll}>重试</Button>}
      />
    );
  }

  const connected = cards.filter((c) => c.tone === "ok").length;
  const attention = cards.filter((c) => c.tone === "warn" || c.tone === "bad").length;
  const failed = cards.filter((c) => c.tone === "bad").length;
  const lastChecked = sources.health.data?.checkedAt ?? sources.recovery.data?.checkedAt ?? sources.diagnostics.data?.checkedAt;
  const gateway = sources.gateway.data;
  const channel = sources.channel.data;

  return (
    <div className="grid gap-[18px]">
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={attention ? "warn" : "ok"} className="gap-1.5">
                <Boxes className="size-3.5" />
                平台目录
              </Badge>
              <Badge variant="mute" className="gap-1.5">
                <ShieldCheck className="size-3.5" />
                只展示真实平台
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-ink-strong">第三方平台与宿主运行时</h1>
            <p className="mt-1 max-w-4xl text-sm text-muted">
              这里管理平台身份、健康、原生能力和低频诊断。模型、IM、CLI、IDE 的日常写入口仍回到各自主域。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refetchAll}>刷新状态</Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="真实平台" value={cards.length} sub="当前仅 OpenClaw" />
          <StatTile label="正常" value={connected} sub="platform ok" />
          <StatTile label="需关注" value={attention} sub={`${failed} 异常`} />
          <StatTile label="最近检查" value={fmtTime(lastChecked)} sub="系统 / 守护证据" />
        </div>
      </section>

      <Panel>
        <PanelHead title="平台目录" sub="只有真实第三方平台进入主列表；关联域不伪装成平台。" />
        {cards.length === 0 ? (
          <EmptyState title="暂无真实平台" description="当前来源 API 没有返回任何平台证据。" />
        ) : (
          <div className="divide-y divide-line">
            {cards.map((card) => <PlatformDirectoryRow key={card.id} card={card} />)}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHead title="关联 Tracevane 域" sub="这些是工作流 owner，不放进平台主列表；这里只提供跳转和状态证据。" />
        <RelatedDomainRow
          icon={Route}
          title="模型网关"
          desc={gateway ? `${gateway.registry.providerCount} provider · ${gateway.listener.host}:${gateway.listener.port}` : "Provider / 模型 / 路由 / 用量归模型网关管理"}
          status={gateway ? (gateway.registry.providerCount > 0 ? "可用" : "无 Provider") : "未知"}
          tone={gateway ? (gateway.registry.providerCount > 0 ? "ok" : "warn") : "info"}
          to="/model-gateway"
          cta="打开网关"
        />
        <RelatedDomainRow
          icon={RadioTower}
          title="IM 渠道"
          desc={channel ? `${channel.runtime.reachable ? "守护在线" : "守护离线"} · Feishu ${channel.runtime.feishuConnections ?? 0} · Octo ${channel.runtime.octoConnections ?? 0}` : "Bot / 账号 / 投递 / 会话归 IM 渠道管理"}
          status={channel ? (channel.runtime.reachable ? "可用" : "离线") : "未知"}
          tone={channel ? (channel.runtime.reachable ? "ok" : "warn") : "info"}
          to="/im-channels"
          cta="打开 IM"
        />
        <RelatedDomainRow icon={Globe} title="CLI 代理" desc="Codex / Claude Code / OpenCode readiness 与 Agent Runs 统一在 CLI 代理查看。" status="Owner" tone="info" to="/cli-agents" cta="打开 CLI" />
        <RelatedDomainRow icon={Globe} title="IDE / Files" desc="终端、文件、Git 与工作区操作属于 IDE / Files，不在 Platform 复制入口。" status="Owner" tone="info" to="/ide" cta="打开 IDE" />
      </Panel>

      <Panel>
        <PanelHead title="兼容入口" sub="旧聚合页保留为深链，不再作为平台主对象。" />
        <div className="py-1.5">
          <EvidenceRow label="集成证据（legacy /external）" value={<Link className="text-accent hover:underline" to="/platforms">进入平台目录</Link>} />
          <EvidenceRow label="任务监督（legacy /long-tasks）" value={<Link className="text-accent hover:underline" to="/cli-agents">进入 CLI 代理</Link>} />
        </div>
      </Panel>
    </div>
  );
}
