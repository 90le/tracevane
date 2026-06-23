import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  Globe,
  PlugZap,
  RadioTower,
  Route,
  Server,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import type { PlatformCard } from "../types";
import { Panel, PanelHead, StatTile, ToneBadge } from "../_shared";
import { usePlatformsAggregate } from "../usePlatformsAggregate";

const CARD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  openclaw: Server,
  "model-gateway": Route,
  channels: RadioTower,
  "external-mcp": PlugZap,
};

function PlatformCardView({ card }: { card: PlatformCard }) {
  const Icon = CARD_ICON[card.id] ?? Globe;
  return (
    <Panel>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
          <Icon />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-md font-semibold text-ink-strong">{card.title}</h3>
          <span className="truncate text-sm text-subtle">{card.category}</span>
        </div>
        <ToneBadge tone={card.tone}>{card.status}</ToneBadge>
      </div>
      <div className="grid gap-3 p-4">
        <p className="text-base text-ink-strong">{card.summary}</p>
        <p className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
          {card.boundary}
        </p>
        <div className="flex flex-wrap gap-2">
          {card.primary.external ? (
            <Button size="sm" asChild>
              <a href={card.primary.to} target="_blank" rel="noreferrer">
                {card.primary.label}
                <ArrowRight />
              </a>
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to={card.primary.to}>
                {card.primary.label}
                <ArrowRight />
              </Link>
            </Button>
          )}
          {card.secondary &&
            (card.secondary.external ? (
              <Button variant="ghost" size="sm" asChild>
                <a href={card.secondary.to} target="_blank" rel="noreferrer">
                  {card.secondary.label}
                </a>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" asChild>
                <Link to={card.secondary.to}>{card.secondary.label}</Link>
              </Button>
            ))}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Platform overview. A read-only list of integrated platforms / runtimes
 * (OpenClaw runtime + the connection domains as cross-links) showing
 * identity / health / version summary and a deep-link to its owning domain or
 * to the platform child. No writes — every action links OUT.
 */
export function OverviewView() {
  const { cards, isLoading, allFailed, error, refetchAll } = usePlatformsAggregate();

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[120px] w-full" />
        <div className="grid gap-[18px] md:grid-cols-2">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载平台集成证据"
        description={error?.message ?? "所有平台来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  const connected = cards.filter((c) => c.tone === "ok").length;
  const attention = cards.filter((c) => c.tone === "warn" || c.tone === "bad").length;

  return (
    <div className="grid gap-[18px]">
      {/* Hero: boundary statement */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={attention ? "warn" : "ok"} className="gap-1.5">
            <Boxes className="size-3.5" />
            平台集成 · {cards.length}
          </Badge>
          <span className="text-sm text-muted">运行时 / 模型厂商 / IM / MCP</span>
          <Badge variant="mute" className="ml-auto gap-1.5">
            <ShieldCheck className="size-3.5" />
            只读边界
          </Badge>
        </div>
        <p className="mt-3 text-base text-ink-strong">
          第三方平台只做接入、健康、凭据与诊断摘要，不吞并 Tracevane 主任务流。
        </p>
        <p className="mt-1 text-sm text-muted">
          OpenClaw 是底层运行时平台；模型厂商、IM、MCP 的日常工作流留在各自产品域，低频平台管理在这里。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="集成平台" value={cards.length} sub={`${connected} 已连接 · ${attention} 需关注`} />
          <StatTile label="运行时" value="OpenClaw" sub="底层平台支撑" />
          <StatTile label="日常工作流" value="各自主域" sub="不迁移进平台" />
          <StatTile label="本页" value="只读" sub="动作回到主域 / 官方 UI" />
        </div>
      </section>

      {cards.length === 0 ? (
        <EmptyState title="暂无集成平台" description="当前来源 API 没有返回任何平台证据。" />
      ) : (
        <div className="grid gap-[18px] md:grid-cols-2">
          {cards.map((card) => (
            <PlatformCardView key={card.id} card={card} />
          ))}
        </div>
      )}

      <Panel>
        <PanelHead title="边界说明" sub="为什么平台集成是低频边界而不是工作台。" />
        <div className="grid gap-3 p-3">
          <p className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
            会话、模型路由、IM 投递、IDE 与任务都留在主工作台与各自产品域。平台集成只展示身份 / 健康 / 版本 /
            诊断摘要，并把管理动作链接回官方 OpenClaw UI 或对应主域确认流。
          </p>
        </div>
      </Panel>
    </div>
  );
}
