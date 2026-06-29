import * as React from "react";

import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";
import {
  useChannelConnectorsAgentSessionsQuery,
  useChannelConnectorsStatusQuery,
} from "@/lib/query/channel-connectors";
import {
  useDashboardSummaryQuery,
  useOpenClawRecoveryStatusQuery,
  useSystemHealthQuery,
  useTerminalStatusQuery,
} from "@/lib/query/dashboard";

import {
  buildActiveWork,
  buildAttentionItems,
  buildPillars,
  buildReadiness,
  buildRecentActivity,
} from "./aggregate";
import type {
  ActiveWorkItem,
  AttentionItem,
  ReadinessPillar,
  ReadinessSummary,
  RecentActivityItem,
} from "../types";

/**
 * Loads every live source the Dashboard cockpit aggregates and derives the
 * task-first view-models (readiness rollup, attention queue, in-progress work,
 * recent activity). Model-gateway status + channel-connectors status/sessions
 * are reused from their owning feature modules; the rest come from the
 * dashboard data layer.
 *
 * Sources are independent: a partial failure degrades one slice (its rows show
 * empty/warn) rather than blanking the whole cockpit. The aggregate only
 * reports a hard error when *every* source has failed.
 */
export function useDashboardAggregate() {
  const summaryQuery = useDashboardSummaryQuery({ retry: false });
  const healthQuery = useSystemHealthQuery({ retry: false });
  const gatewayQuery = useModelGatewayStatusQuery({ retry: false });
  const channelStatusQuery = useChannelConnectorsStatusQuery({ retry: false });
  const channelSessionsQuery = useChannelConnectorsAgentSessionsQuery({
    retry: false,
  });
  const terminalQuery = useTerminalStatusQuery({ retry: false });
  const recoveryQuery = useOpenClawRecoveryStatusQuery({ retry: false });

  const queries = [
    summaryQuery,
    healthQuery,
    gatewayQuery,
    channelStatusQuery,
    channelSessionsQuery,
    terminalQuery,
    recoveryQuery,
  ] as const;

  const sources = React.useMemo(
    () => ({
      summary: summaryQuery.data,
      health: healthQuery.data,
      gateway: gatewayQuery.data,
      channelStatus: channelStatusQuery.data,
      channelSessions: channelSessionsQuery.data,
      terminal: terminalQuery.data,
      recovery: recoveryQuery.data,
    }),
    [
      summaryQuery.data,
      healthQuery.data,
      gatewayQuery.data,
      channelStatusQuery.data,
      channelSessionsQuery.data,
      terminalQuery.data,
      recoveryQuery.data,
    ],
  );

  const attention: AttentionItem[] = React.useMemo(
    () => buildAttentionItems(sources),
    [sources],
  );
  const pillars: ReadinessPillar[] = React.useMemo(
    () => buildPillars(sources),
    [sources],
  );
  const activeWork: ActiveWorkItem[] = React.useMemo(
    () => buildActiveWork(sources),
    [sources],
  );
  const recentActivity: RecentActivityItem[] = React.useMemo(
    () => buildRecentActivity(sources),
    [sources],
  );
  const readiness: ReadinessSummary = React.useMemo(
    () => buildReadiness(pillars, attention),
    [pillars, attention],
  );

  const isLoading = queries.every((q) => q.isLoading);
  const allFailed = queries.every((q) => q.isError);
  const firstError = queries.find((q) => q.isError)?.error ?? null;

  const refetchAll = React.useCallback(() => {
    void summaryQuery.refetch();
    void healthQuery.refetch();
    void gatewayQuery.refetch();
    void channelStatusQuery.refetch();
    void channelSessionsQuery.refetch();
    void terminalQuery.refetch();
    void recoveryQuery.refetch();
  }, [
    summaryQuery,
    healthQuery,
    gatewayQuery,
    channelStatusQuery,
    channelSessionsQuery,
    terminalQuery,
    recoveryQuery,
  ]);

  const isFetching = queries.some((q) => q.isFetching);

  return {
    readiness,
    pillars,
    attention,
    activeWork,
    recentActivity,
    summary: summaryQuery.data,
    isLoading,
    isFetching,
    allFailed,
    error: firstError,
    refetchAll,
    sources: {
      summary: summaryQuery,
      health: healthQuery,
      gateway: gatewayQuery,
      channelStatus: channelStatusQuery,
      channelSessions: channelSessionsQuery,
      terminal: terminalQuery,
      recovery: recoveryQuery,
    },
  };
}

export type DashboardAggregate = ReturnType<typeof useDashboardAggregate>;
