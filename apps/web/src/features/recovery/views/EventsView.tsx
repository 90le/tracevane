import * as React from "react";
import { Activity, RefreshCw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useRecoveryEventsQuery } from "@/lib/query/recovery";
import type { OpenClawRecoveryEventSeverity } from "../types";
import { Panel, PanelHead, formatTime } from "@/design/ui/panel";
import { EVENT_SEVERITY_BADGE, Pager } from "./shared";

const PAGE_SIZE = 20;

/** Timeline dot per event severity — dot + soft halo (semantic tokens only). */
const EVENT_DOT: Record<OpenClawRecoveryEventSeverity, string> = {
  error: "bg-danger shadow-[0_0_0_4px_var(--color-danger-soft)]",
  warning: "bg-warning shadow-[0_0_0_4px_var(--color-warning-soft)]",
  success: "bg-success shadow-[0_0_0_4px_var(--color-success-soft)]",
  info: "bg-primary shadow-[0_0_0_4px_var(--color-info-soft)]",
};

/** Read-only paged recovery event log, rendered as a vertical timeline. */
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
          <ol className="grid px-4 py-3">
            {events.map((event, index) => {
              const badge = EVENT_SEVERITY_BADGE[event.severity] ?? EVENT_SEVERITY_BADGE.info;
              return (
                <li key={event.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex w-2 shrink-0 flex-col items-center"
                  >
                    <span
                      className={cn(
                        "mt-[7px] size-2 shrink-0 rounded-full",
                        EVENT_DOT[event.severity] ?? EVENT_DOT.info,
                      )}
                    />
                    {index < events.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-line" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pb-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-base text-ink-strong">
                        {event.title || event.kind}
                      </strong>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <span className="ml-auto shrink-0 text-2xs text-subtle">
                        {formatTime(event.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {event.summary || event.kind}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
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
