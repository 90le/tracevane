import * as React from "react";
import { Activity, AlertCircle, CheckCircle2, Info, RefreshCw } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useRecoveryEventsQuery } from "@/lib/query/recovery";
import type { OpenClawRecoveryEventSeverity } from "../types";
import { EVENT_SEVERITY_BADGE, Pager, Panel, PanelHead, Row, formatTime } from "./shared";

const PAGE_SIZE = 20;

function severityIcon(severity: OpenClawRecoveryEventSeverity): React.ReactNode {
  if (severity === "error") return <AlertCircle />;
  if (severity === "warning") return <AlertCircle />;
  if (severity === "success") return <CheckCircle2 />;
  return <Info />;
}

function severityIconClass(severity: OpenClawRecoveryEventSeverity): string | undefined {
  if (severity === "error") return "bg-danger-soft text-danger";
  if (severity === "warning") return "bg-warning-soft text-warning";
  if (severity === "success") return "bg-success-soft text-success";
  return undefined;
}

/** Read-only paged recovery event log. */
export function EventsView() {
  const [page, setPage] = React.useState(1);
  const eventsQuery = useRecoveryEventsQuery(page, PAGE_SIZE);

  const data = eventsQuery.data;
  const events = data?.events ?? [];
  const pagination = data?.pagination;

  return (
    <Panel>
      <PanelHead
        title="守护事件"
        sub="最近的恢复事件，按时间倒序"
        action={
          <Button variant="ghost" size="sm" onClick={() => void eventsQuery.refetch()}>
            <RefreshCw className={eventsQuery.isFetching ? "animate-spin" : undefined} />
            刷新
          </Button>
        }
      />
      {eventsQuery.isLoading ? (
        <div className="py-1.5" role="status" aria-busy="true">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : eventsQuery.error ? (
        <ErrorState
          title="无法加载守护事件"
          description={eventsQuery.error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => void eventsQuery.refetch()}>
              重试
            </Button>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<Activity />}
          title="暂无守护事件"
          description="没有事件不代表不可用，继续以状态 / 探测 / 服务为准。"
        />
      ) : (
        <>
          <div className="py-1.5">
            {events.map((event) => {
              const badge = EVENT_SEVERITY_BADGE[event.severity] ?? EVENT_SEVERITY_BADGE.info;
              return (
                <Row
                  key={event.id}
                  icon={severityIcon(event.severity)}
                  iconClass={severityIconClass(event.severity)}
                  title={event.title || event.kind}
                  subtitle={`${event.summary || event.kind} · ${formatTime(event.occurredAt)}`}
                  trailing={<Badge variant={badge.variant}>{badge.label}</Badge>}
                />
              );
            })}
          </div>
          {pagination && (
            <Pager
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalEntries={pagination.totalEntries}
              hasPreviousPage={pagination.hasPreviousPage}
              hasNextPage={pagination.hasNextPage}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              pending={eventsQuery.isFetching}
            />
          )}
        </>
      )}
    </Panel>
  );
}
