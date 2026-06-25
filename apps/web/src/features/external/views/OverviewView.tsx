import * as React from "react";
import {
  Globe,
  KeyRound,
  PlugZap,
  RadioTower,
  Route,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import type { ExternalConnectionKind } from "../types";
import type { ExternalViewProps } from "./types";
import { Panel, PanelHead, Row, StatTile, ToneBadge } from "./_shared";
import { useExternalAggregate } from "./useExternalAggregate";

const KIND_ICON: Record<ExternalConnectionKind, React.ComponentType<{ className?: string }>> = {
  mcp: PlugZap,
  tools: Wrench,
  "app-connection": Route,
  messaging: RadioTower,
  http: Globe,
};

export function OverviewView({ goToView }: ExternalViewProps) {
  const { connections, isLoading, allFailed, error, refetchAll } = useExternalAggregate();

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[132px] w-full" />
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载集成证据"
        description={error?.message ?? "所有聚合来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  const healthy = connections.filter((c) => c.tone === "ok").length;
  const attention = connections.filter((c) => c.tone === "warn" || c.tone === "bad").length;
  const appConnections = connections.filter((c) => c.kind === "app-connection");

  return (
    <div className="grid gap-[18px]">
      {/* Hero: aggregate health + boundary statement */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={attention ? "warn" : "ok"} className="gap-1.5">
            <PlugZap className="size-3.5" />
            集成证据 · {connections.length}
          </Badge>
          <span className="text-sm text-muted">
            MCP / tools / app connections / IM transports / HTTP bridge
          </span>
          <Badge variant="mute" className="ml-auto gap-1.5">
            <ShieldCheck className="size-3.5" />
            只读聚合
          </Badge>
        </div>
        <p className="mt-3 text-base text-ink-strong">
          集成证据只暴露能力与健康证据，不把上游凭据带进浏览器。
        </p>
        <p className="mt-1 text-sm text-muted">
          新增 / 测试 / 删除连接、OAuth 刷新与 App Connection apply / rollback 都回到对应主域确认流。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="连接" value={connections.length} sub={`${healthy} 健康 · ${attention} 需关注`} />
          <StatTile label="App Connections" value={appConnections.length} sub="Gateway 拥有 apply 流" />
          <StatTile
            label="MCP servers"
            value={connections.find((c) => c.id === "mcp")?.capabilities.length ?? 0}
            sub="服务端持有"
          />
          <StatTile
            label="可用 skills"
            value={connections.find((c) => c.id === "skills")?.summary ?? "—"}
            sub="本地工具能力"
          />
        </div>
      </section>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Capability summary by owning domain */}
        <Panel>
          <PanelHead
            title="能力摘要"
            sub="按主产品域归属展示。"
            action={
              <Button variant="ghost" size="sm" onClick={() => goToView("connections")}>
                查看连接
              </Button>
            }
          />
          {connections.length === 0 ? (
            <EmptyState
              title="暂无集成证据"
              description="当前来源 API 没有返回任何集成证据。"
            />
          ) : (
            <div className="py-1.5">
              {connections.map((c) => {
                const Icon = KIND_ICON[c.kind];
                return (
                  <Row
                    key={c.id}
                    icon={<Icon />}
                    iconClass={c.tone === "ok" ? "bg-green-soft text-green" : undefined}
                    title={c.title}
                    subtitle={`${c.kindLabel} · ${c.summary}`}
                    trailing={<ToneBadge tone={c.tone}>{c.status}</ToneBadge>}
                    onClick={() => goToView("connections", { conn: c.id })}
                  />
                );
              })}
            </div>
          )}
        </Panel>

        {/* Security boundary — this page is read-only */}
        <Panel>
          <PanelHead title="安全边界" sub="本页只读，不执行连接动作。" action={<Badge variant="mute">read-only</Badge>} />
          <div className="grid gap-3 p-3">
            <p className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
              MCP server、OAuth、App Connection apply / rollback、IM transport smoke 都可能触发外部网络或写配置，必须回到对应主域确认流。
            </p>
            <Row
              icon={<KeyRound />}
              title="凭据"
              subtitle="浏览器只接收掩码摘要"
              trailing={<Badge variant="mute">masked</Badge>}
            />
            <Row
              icon={<ShieldCheck />}
              title="归属"
              subtitle="Gateway / IM / Platform 拥有写入"
              trailing={<Badge variant="mute">domain</Badge>}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
