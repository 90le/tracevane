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

const CRITICAL_STALE_MS = 10_000;
const SECONDARY_STALE_MS = 30_000;
const SECONDARY_SOURCE_DELAY_MS = 250;

function useAfterFirstPaint(): boolean {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    if (enabled) return;
    let timeout: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      timeout = window.setTimeout(
        () => setEnabled(true),
        SECONDARY_SOURCE_DELAY_MS,
      );
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [enabled]);

  return enabled;
}

/**
 * Loads the Dashboard cockpit in two phases. The first paint only starts the
 * critical, lightweight summary/health requests so the shell and static task
 * frame are visible immediately. Slower owner-domain probes (gateway, channel
 * daemon/sessions, terminal binary status, platform guard) start after first
 * paint and hydrate the same view-models progressively.
 *
 * Sources are independent: a partial failure degrades one slice rather than
 * blanking the whole cockpit. A hard error is shown only after the deferred
 * probes have run and every source failed.
 */
export function useDashboardAggregate() {
  const secondarySourcesEnabled = useAfterFirstPaint();
  const summaryQuery = useDashboardSummaryQuery({
    retry: false,
    staleTime: CRITICAL_STALE_MS,
  });
  const healthQuery = useSystemHealthQuery({
    retry: false,
    staleTime: CRITICAL_STALE_MS,
  });
  const gatewayQuery = useModelGatewayStatusQuery({
    enabled: secondarySourcesEnabled,
    retry: false,
    staleTime: SECONDARY_STALE_MS,
  });
  const channelStatusQuery = useChannelConnectorsStatusQuery({
    enabled: secondarySourcesEnabled,
    retry: false,
    staleTime: SECONDARY_STALE_MS,
  });
  const channelSessionsQuery = useChannelConnectorsAgentSessionsQuery({
    enabled: secondarySourcesEnabled,
    retry: false,
    staleTime: SECONDARY_STALE_MS,
  });
  const terminalQuery = useTerminalStatusQuery({
    enabled: secondarySourcesEnabled,
    retry: false,
    staleTime: SECONDARY_STALE_MS,
  });
  const recoveryQuery = useOpenClawRecoveryStatusQuery({
    enabled: secondarySourcesEnabled,
    retry: false,
    staleTime: SECONDARY_STALE_MS,
  });

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

  const isBootstrapping =
    !summaryQuery.data && !healthQuery.data &&
    (summaryQuery.isLoading || healthQuery.isLoading);
  const allFailed = secondarySourcesEnabled && queries.every((q) => q.isError);
  const firstError = queries.find((q) => q.isError)?.error ?? null;

  const refetchSummary = summaryQuery.refetch;
  const refetchHealth = healthQuery.refetch;
  const refetchGateway = gatewayQuery.refetch;
  const refetchChannelStatus = channelStatusQuery.refetch;
  const refetchChannelSessions = channelSessionsQuery.refetch;
  const refetchTerminal = terminalQuery.refetch;
  const refetchRecovery = recoveryQuery.refetch;

  const refetchAll = React.useCallback(() => {
    void refetchSummary();
    void refetchHealth();
    if (!secondarySourcesEnabled) return;
    void refetchGateway();
    void refetchChannelStatus();
    void refetchChannelSessions();
    void refetchTerminal();
    void refetchRecovery();
  }, [
    refetchSummary,
    refetchHealth,
    refetchGateway,
    refetchChannelStatus,
    refetchChannelSessions,
    refetchTerminal,
    refetchRecovery,
    secondarySourcesEnabled,
  ]);

  const isFetching = queries.some((q) => q.isFetching);

  return {
    readiness,
    pillars,
    attention,
    activeWork,
    recentActivity,
    summary: summaryQuery.data,
    isBootstrapping,
    secondarySourcesEnabled,
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
