import { Link } from "react-router-dom";
import { ArrowRight, Boxes, Server, ShieldCheck } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { PageHeader } from "@/design/ui/page-header";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";

import type { PlatformCard } from "../types";
import { Panel, PanelHead, ToneBadge } from "../_shared";
import { usePlatformsAggregate } from "../usePlatformsAggregate";

function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
 * Platform directory. This page is a pure platform index: only real third-party
 * platforms enter the list. Workflow-domain handoffs and legacy compatibility
 * links stay out of this page to keep the architecture unambiguous.
 */
export function OverviewView() {
  const { cards, isLoading, allFailed, error, refetchAll, sources } = usePlatformsAggregate({ includeDiagnostics: false });

  if (isLoading) {
    return <LoadingState title="正在加载平台目录…" />;
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

  return (
    <div className="grid gap-[18px]">
      <PageHeader
        className="px-0"
        title="平台目录"
        description="这里仅呈现真实平台身份、健康、原生能力和低频诊断。模型、IM、CLI、Workspace 等工作流入口保持在各自主导航中。"
        meta={<>
          <Badge variant="info" className="gap-1.5"><Boxes className="size-3.5" />第三方平台索引</Badge>
          <Badge variant="mute" className="gap-1.5"><ShieldCheck className="size-3.5" />只列出真实第三方平台</Badge>
        </>}
        actions={<Button variant="outline" size="sm" onClick={refetchAll}>刷新状态</Button>}
      />

      <MetricRail>
        <MetricTile label="真实平台" value={cards.length} hint="当前仅 OpenClaw" icon={<Boxes />} />
        <MetricTile label="正常" value={connected} tone={connected > 0 ? "ok" : "default"} hint="健康检查通过" />
        <MetricTile label="需关注" value={attention} tone={failed > 0 ? "bad" : attention > 0 ? "warn" : "default"} hint={`${failed} 异常`} />
        <MetricTile label="最近检查" value={<span className="text-base">{fmtTime(lastChecked)}</span>} hint="系统 / 守护证据" />
      </MetricRail>

      <Panel>
        <PanelHead title="平台清单" sub="只有真实第三方平台进入主列表；其它工作流请使用主导航。" />
        {cards.length === 0 ? (
          <EmptyState
            title="暂无真实平台"
            description="当前来源 API 没有返回任何平台证据；确认 OpenClaw 运行正常后刷新。"
            action={<Button variant="outline" size="sm" onClick={refetchAll}>重试</Button>}
          />
        ) : (
          <div className="divide-y divide-line">
            {cards.map((card) => <PlatformDirectoryRow key={card.id} card={card} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}
