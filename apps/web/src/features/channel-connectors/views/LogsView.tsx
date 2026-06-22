import { RefreshCw, ScrollText } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { useChannelConnectorsDaemonLogsQuery } from "@/lib/query/channel-connectors";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead, formatTime } from "./_shared";

export function LogsView(_props: ChannelConnectorsViewProps) {
  const logsQuery = useChannelConnectorsDaemonLogsQuery();

  if (logsQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (logsQuery.error) {
    return (
      <ErrorState
        title="无法加载守护日志"
        description={logsQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void logsQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const data = logsQuery.data;
  const lines = data?.lines ?? [];

  return (
    <Panel>
      <PanelHead
        title="Daemon 日志"
        sub={data?.logFile ?? "来自 /api/channel-connectors/daemon/logs"}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{lines.length} 行</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void logsQuery.refetch()}
              disabled={logsQuery.isFetching}
            >
              <RefreshCw className={logsQuery.isFetching ? "animate-spin" : undefined} />
              刷新
            </Button>
          </div>
        }
      />
      <div className="px-4 py-2 text-xs text-subtle">
        {data?.exists === false
          ? "日志文件尚不存在。"
          : `检查于 ${formatTime(data?.checkedAt)}`}
      </div>
      {lines.length === 0 ? (
        <EmptyState
          title="暂无日志"
          description="守护进程尚未输出任何日志行。"
          icon={<ScrollText />}
        />
      ) : (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words border-t border-line bg-panel-2 px-4 py-3 font-mono text-xs text-muted">
          {lines.join("\n")}
        </pre>
      )}
    </Panel>
  );
}
