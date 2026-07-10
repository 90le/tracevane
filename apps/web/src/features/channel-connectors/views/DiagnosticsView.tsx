import * as React from "react";
import { RadioTower, RefreshCw, ScrollText } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsConfigQuery,
  useChannelConnectorsDaemonConfigQuery,
  useChannelConnectorsDaemonLogsQuery,
  useChannelConnectorsStatusQuery,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead, Row, formatTime } from "./_shared";
import { DaemonServicePanel } from "./DaemonServicePanel";
import {
  groupChannelConnectorAccounts,
  runtimeAccountState,
} from "./account-runtime";

function isProblemLogLine(line: string): boolean {
  return /\b(error|failed|failure|exception|fatal|timeout|denied|warn|502|500|401|403)\b/i.test(line);
}

function truncateLogLine(line: string, max = 260): string {
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function summarizeLogs(lines: string[]) {
  const problemLines = lines.filter(isProblemLogLine);
  const lastLine = [...lines].reverse().find((line) => line.trim()) ?? "";
  return {
    total: lines.length,
    problemLines: problemLines.slice(-8).reverse(),
    problemCount: problemLines.length,
    lastLine,
  };
}

export function DiagnosticsView({ goToView }: ChannelConnectorsViewProps) {
  const statusQuery = useChannelConnectorsStatusQuery();
  const configQuery = useChannelConnectorsConfigQuery();
  const daemonConfigQuery = useChannelConnectorsDaemonConfigQuery();
  const logsQuery = useChannelConnectorsDaemonLogsQuery();
  const [showNative, setShowNative] = React.useState(false);
  const [showRawLogs, setShowRawLogs] = React.useState(false);

  if (statusQuery.isLoading || configQuery.isLoading || daemonConfigQuery.isLoading || logsQuery.isLoading) {
    return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  }
  const error = statusQuery.error ?? configQuery.error ?? daemonConfigQuery.error ?? logsQuery.error;
  if (error) {
    return <ErrorState title="无法加载守护诊断" description={error.message} action={<Button variant="outline" size="sm" onClick={() => { void statusQuery.refetch(); void configQuery.refetch(); void daemonConfigQuery.refetch(); void logsQuery.refetch(); }}>重试</Button>} />;
  }

  const status = statusQuery.data;
  const accountHealth = groupChannelConnectorAccounts(
    configQuery.data?.config.platformBindings ?? [],
  ).map((group) => ({
    group,
    state: runtimeAccountState(group, status?.runtime),
  })).sort((a, b) => {
    const priority = { warn: 0, info: 1, ok: 2, mute: 3 } as const;
    return priority[a.state.variant] - priority[b.state.variant];
  });
  const accountIssueCount = accountHealth.filter(
    ({ state }) => state.variant === "warn",
  ).length;
  const manager = status?.service.serviceManager;
  const config = daemonConfigQuery.data?.config;
  const nativeBindings = (config?.projects ?? []).flatMap((project) => project.platformBindings.map((binding) => ({ project, binding })));
  const lines = logsQuery.data?.lines ?? [];
  const logSummary = summarizeLogs(lines);

  return (
    <div className="grid gap-[18px]">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink-strong">守护诊断</h2>
        <p className="text-sm text-muted">Channel Connectors daemon、service、生成配置和日志证据；不在此编辑账号或路由。</p>
      </div>

      <Panel>
        <PanelHead
          title="账号连接健康"
          sub={accountIssueCount > 0 ? `${accountIssueCount} 个账号需要处理` : "所有启用账号连接正常"}
          action={<Button variant="ghost" size="sm" onClick={() => goToView("accounts")}>平台账号</Button>}
        />
        {accountHealth.length === 0 ? (
          <EmptyState title="暂无平台账号" description="创建账号后将在这里显示连接健康。" />
        ) : (
          <div className="divide-y divide-line py-1.5">
            {accountHealth.map(({ group, state }) => {
              const binding = group.representative;
              return (
                <Row
                  key={group.key}
                  icon={<RadioTower />}
                  iconClass={state.variant === "ok" ? "bg-green-soft text-green" : state.variant === "warn" ? "bg-amber-soft text-amber" : undefined}
                  title={binding.displayName || binding.id}
                  subtitle={`${binding.platform} · ${state.description}`}
                  subtitleClassName="whitespace-normal break-words"
                  trailing={<Badge variant={state.variant}>{state.label}</Badge>}
                  onClick={() => goToView("accounts", { binding: binding.id })}
                />
              );
            })}
          </div>
        )}
      </Panel>

      <DaemonServicePanel onMutated={() => { void statusQuery.refetch(); void configQuery.refetch(); void daemonConfigQuery.refetch(); }} />

      <Panel>
        <PanelHead title="诊断检查" sub={`检查于 ${formatTime(status?.checkedAt)}`} />
        <div className="py-1.5">
          <Row icon={<RadioTower />} title="service active" subtitle={manager?.lastError ?? "systemd/user service 状态"} trailing={<Badge variant={manager?.active ? "ok" : "warn"}>{manager?.active ? "active" : "not active"}</Badge>} />
          <Row icon={<RadioTower />} title="service enabled" subtitle="开机自启" trailing={<Badge variant={manager?.enabled ? "ok" : "mute"}>{manager?.enabled == null ? "unknown" : manager.enabled ? "enabled" : "disabled"}</Badge>} />
          <Row icon={<RadioTower />} title="native config" subtitle={daemonConfigQuery.data?.configPath ?? "daemon config"} trailing={<Badge variant="info">{config?.projects.length ?? 0} projects</Badge>} />
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="生成配置证据"
          sub="Daemon 原生绑定只作为运行时映射证据，不再作为第二套用户编辑列表。"
          action={<Button variant="ghost" size="sm" onClick={() => setShowNative((value) => !value)}>{showNative ? "收起" : "展开"}</Button>}
        />
        {showNative && (
          nativeBindings.length === 0 ? <EmptyState title="暂无生成绑定" description="daemon config 尚未生成 project/binding 映射。" /> : (
            <div className="py-1.5">
              {nativeBindings.map(({ project, binding }) => (
                <Row key={`${project.id}-${binding.id}`} icon={<RadioTower />} title={binding.displayName || binding.id} subtitle={`${binding.platform} · ${project.name || project.id} · ${binding.agent}`} trailing={<Badge variant={binding.enabled ? "ok" : "mute"}>{binding.enabled ? "启用" : "停用"}</Badge>} />
              ))}
            </div>
          )
        )}
      </Panel>

      <Panel>
        <PanelHead
          title="日志摘要"
          sub={logsQuery.data?.logFile ?? "daemon logs"}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowRawLogs((value) => !value)}>{showRawLogs ? "收起原始日志" : "原始日志"}</Button>
              <Button variant="outline" size="sm" onClick={() => void logsQuery.refetch()} disabled={logsQuery.isFetching}><RefreshCw className={logsQuery.isFetching ? "animate-spin" : undefined} />刷新</Button>
            </div>
          }
        />
        {lines.length === 0 ? (
          <EmptyState title="暂无日志" description="守护进程尚未输出日志。" icon={<ScrollText />} />
        ) : (
          <div className="grid min-w-0 gap-3 border-t border-line p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-sm border border-line bg-panel-2 p-3"><div className="text-xs text-subtle">日志行数</div><div className="text-lg font-semibold text-ink-strong">{logSummary.total}</div></div>
              <div className="rounded-sm border border-line bg-panel-2 p-3"><div className="text-xs text-subtle">疑似问题行</div><div className="text-lg font-semibold text-ink-strong">{logSummary.problemCount}</div></div>
              <div className="rounded-sm border border-line bg-panel-2 p-3"><div className="text-xs text-subtle">最新输出</div><div className="break-all text-sm text-muted">{truncateLogLine(logSummary.lastLine, 120) || "—"}</div></div>
            </div>
            {logSummary.problemLines.length > 0 ? (
              <div className="grid gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-strong"><ScrollText className="size-4" />问题行优先</div>
                {logSummary.problemLines.map((line, index) => (
                  <code key={`${line}-${index}`} className="block max-w-full overflow-x-auto whitespace-pre-wrap rounded-sm border border-amber bg-amber-soft px-3 py-2 font-mono text-xs text-amber break-all">
                    {truncateLogLine(line)}
                  </code>
                ))}
              </div>
            ) : (
              <div className="rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-muted">未发现 error / failed / timeout / 5xx 等高信号日志。</div>
            )}
            {showRawLogs && (
              <pre className="max-h-[min(52vh,520px)] max-w-full overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-panel-2 px-4 py-3 font-mono text-xs text-muted">
                {lines.slice(-160).join("\n")}
              </pre>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
