import * as React from "react";
import { RadioTower, RefreshCw, ScrollText } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsDaemonConfigQuery,
  useChannelConnectorsDaemonLogsQuery,
  useChannelConnectorsStatusQuery,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead, Row, formatTime } from "./_shared";
import { DaemonServicePanel } from "./DaemonServicePanel";

export function DiagnosticsView(_props: ChannelConnectorsViewProps) {
  const statusQuery = useChannelConnectorsStatusQuery();
  const daemonConfigQuery = useChannelConnectorsDaemonConfigQuery();
  const logsQuery = useChannelConnectorsDaemonLogsQuery();
  const [showNative, setShowNative] = React.useState(false);

  if (statusQuery.isLoading || daemonConfigQuery.isLoading || logsQuery.isLoading) {
    return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  }
  const error = statusQuery.error ?? daemonConfigQuery.error ?? logsQuery.error;
  if (error) {
    return <ErrorState title="无法加载守护诊断" description={error.message} action={<Button variant="outline" size="sm" onClick={() => { void statusQuery.refetch(); void daemonConfigQuery.refetch(); void logsQuery.refetch(); }}>重试</Button>} />;
  }

  const status = statusQuery.data;
  const manager = status?.service.serviceManager;
  const config = daemonConfigQuery.data?.config;
  const nativeBindings = (config?.projects ?? []).flatMap((project) => project.platformBindings.map((binding) => ({ project, binding })));
  const lines = logsQuery.data?.lines ?? [];

  return (
    <div className="grid gap-[18px]">
      <div>
        <h2 className="text-lg font-semibold text-ink-strong">守护诊断</h2>
        <p className="text-sm text-muted">Channel Connectors daemon、service、生成配置和日志证据；不在此编辑账号或路由。</p>
      </div>

      <DaemonServicePanel onMutated={() => { void statusQuery.refetch(); void daemonConfigQuery.refetch(); }} />

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
          title="最近日志"
          sub={logsQuery.data?.logFile ?? "daemon logs"}
          action={<Button variant="outline" size="sm" onClick={() => void logsQuery.refetch()} disabled={logsQuery.isFetching}><RefreshCw className={logsQuery.isFetching ? "animate-spin" : undefined} />刷新</Button>}
        />
        {lines.length === 0 ? <EmptyState title="暂无日志" description="守护进程尚未输出日志。" icon={<ScrollText />} /> : <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words border-t border-line bg-panel-2 px-4 py-3 font-mono text-xs text-muted">{lines.slice(-120).join("\n")}</pre>}
      </Panel>
    </div>
  );
}
