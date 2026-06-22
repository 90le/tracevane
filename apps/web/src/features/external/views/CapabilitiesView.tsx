import * as React from "react";
import { Wrench } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import type { ExternalViewProps } from "./types";
import { Panel, PanelHead, ToneBadge } from "./_shared";
import { collectCapabilities } from "./aggregate";
import { useExternalAggregate } from "./useExternalAggregate";

export function CapabilitiesView({ goToView }: ExternalViewProps) {
  const { connections, isLoading, allFailed, error, refetchAll } = useExternalAggregate();

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
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
        title="无法加载能力清单"
        description={error?.message ?? "所有聚合来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  const groups = collectCapabilities(connections);
  const total = groups.reduce((sum, g) => sum + g.capabilities.length, 0);

  if (groups.length === 0) {
    return (
      <Panel>
        <PanelHead title="工具能力" sub="MCP servers / skills / 平台传输暴露的能力。" />
        <EmptyState
          title="暂无可枚举能力"
          description="当前来源未返回 MCP server、skill 或平台传输的能力清单。"
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-[18px]">
      <p className="text-sm text-subtle">
        共 {total} 项能力 · 安装 / 启停 / 增删仍归对应主域（平台或 OpenClaw），此处仅展示证据。
      </p>
      {groups.map(({ connection, capabilities }) => (
        <Panel key={connection.id}>
          <PanelHead
            title={connection.title}
            sub={`${connection.kindLabel} · ${connection.source}`}
            action={
              <div className="flex items-center gap-2">
                <Badge variant="outline">{capabilities.length}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goToView("connections", { conn: connection.id })}
                >
                  详情
                </Button>
              </div>
            }
          />
          <div className="py-1.5">
            {capabilities.map((cap) => (
              <div key={cap.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                  <Wrench />
                </span>
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-base text-ink-strong">{cap.name}</strong>
                  <span className="truncate text-sm text-muted">{cap.detail}</span>
                </span>
                <ToneBadge tone={cap.tone}>{cap.tone === "ok" ? "ready" : cap.tone}</ToneBadge>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
