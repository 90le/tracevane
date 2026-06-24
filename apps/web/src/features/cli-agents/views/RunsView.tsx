import * as React from "react";
import {
  Activity,
  ExternalLink,
  MessageSquare,
  RadioTower,
  RefreshCw,
  SquareTerminal,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useAgentRuntimeRunsQuery } from "@/lib/query/agents";

import type { AgentRuntimeRunSource, AgentRuntimeRunSummary, CliAgentsViewProps, WorkbenchTone } from "../types";
import { Fact, Panel, PanelHead, Row, StatTile, ToneBadge, formatTime, toneIconClass } from "./_shared";

const SOURCE_LABEL: Record<AgentRuntimeRunSource, string> = {
  terminal: "终端",
  "im-channel": "IM",
  chat: "对话",
};

function sourceIcon(source: AgentRuntimeRunSource): React.ReactNode {
  if (source === "terminal") return <SquareTerminal />;
  if (source === "im-channel") return <RadioTower />;
  return <MessageSquare />;
}

function runTone(run: AgentRuntimeRunSummary): WorkbenchTone {
  if (run.status === "failed" || run.status === "lost") return "bad";
  if (run.status === "running") return "ok";
  if (run.status === "detached") return "warn";
  if (run.status === "idle") return "info";
  return "mute";
}

function targetHref(run: AgentRuntimeRunSummary): string {
  const first = run.evidenceRefs.find((ref) => ref.href)?.href;
  if (first) return first;
  if (run.source === "terminal") return "#/cli-agents?view=sessions";
  if (run.source === "im-channel") return "#/im-channels?view=sessions";
  return "#/chat";
}

/**
 * Unified Agent Run view. This is intentionally a projection, not a fourth
 * owning runtime: terminal sessions, IM agent sessions and chat sessions keep
 * their original owners while CLI Agents becomes the operator's runtime list.
 */
export function RunsView(_props: CliAgentsViewProps) {
  const runs = useAgentRuntimeRunsQuery();
  const rows = runs.data?.runs ?? [];
  const totals = runs.data?.totals;

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="运行中 / Agent Runs"
          sub="统一展示终端、IM 渠道、对话三类 Agent 运行状态；写操作仍回到各自归属页。"
          action={
            <Button variant="outline" size="sm" onClick={() => void runs.refetch()}>
              <RefreshCw />
              刷新
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-2.5 border-b border-line p-4 sm:grid-cols-5">
          <StatTile icon={<Activity />} label="全部 Run" value={totals?.total ?? "—"} />
          <StatTile icon={<Activity />} label="运行中" value={totals?.running ?? "—"} />
          <StatTile icon={<SquareTerminal />} label="终端" value={totals?.terminal ?? "—"} />
          <StatTile icon={<RadioTower />} label="IM" value={totals?.imChannel ?? "—"} />
          <StatTile icon={<MessageSquare />} label="对话" value={totals?.chat ?? "—"} />
        </div>
        <div className="grid gap-0.5 p-1">
          {runs.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : runs.error ? (
            <ErrorState
              title="Agent Run 聚合不可用"
              description={runs.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void runs.refetch()}>
                  重试
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="暂无 Agent Run"
              description="启动 CLI 终端、触发 IM 任务或打开对话后会出现在这里。"
            />
          ) : (
            rows.map((run) => {
              const tone = runTone(run);
              return (
                <Row
                  key={run.id}
                  icon={sourceIcon(run.source)}
                  iconClass={toneIconClass(tone)}
                  title={run.title}
                  subtitle={[
                    SOURCE_LABEL[run.source],
                    run.cli,
                    run.model,
                    run.workspace,
                    formatTime(run.updatedAt),
                  ].filter(Boolean).join(" · ")}
                  trailing={
                    <span className="flex items-center gap-2">
                      <ToneBadge tone={tone}>{run.statusLabel}</ToneBadge>
                      <ExternalLink className="size-3.5 text-subtle" />
                    </span>
                  }
                  onClick={() => (window.location.hash = targetHref(run))}
                />
              );
            })
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="边界说明" sub="为什么不是把三个域硬合并成一个页面。" />
        <dl className="grid gap-2.5 p-4 sm:grid-cols-3">
          <Fact label="Model Gateway">只管理模型、Provider、协议、路由和客户端配置。</Fact>
          <Fact label="IM Channels">只管理平台账号、绑定、IM 会话和消息投递。</Fact>
          <Fact label="CLI Agents">聚合 Agent 运行态、Persona、CLI 状态和证据。</Fact>
        </dl>
      </Panel>
    </div>
  );
}

export default RunsView;
