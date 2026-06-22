import * as React from "react";

import { useModelGatewayAppConnectionsQuery } from "@/lib/query/model-gateway";
import { useChannelConnectorsStatusQuery } from "@/lib/query/channel-connectors";
import {
  useOpenClawConfigSummaryQuery,
  useSkillsSummaryQuery,
  useSystemDiagnosticsQuery,
} from "@/lib/query/external";

import { buildConnections } from "./aggregate";
import type { ExternalConnection } from "../types";

/**
 * Loads every source the External console aggregates and builds the derived
 * connection view-model. App-connections + channel-status are reused from
 * their owning feature modules; config / skills / diagnostics come from the
 * external data layer. Exposes aggregate loading/error and per-source query
 * objects so views can render three-states + refetch.
 */
export function useExternalAggregate() {
  const configQuery = useOpenClawConfigSummaryQuery({ retry: false });
  const skillsQuery = useSkillsSummaryQuery({ retry: false });
  const appConnectionsQuery = useModelGatewayAppConnectionsQuery({ retry: false });
  const channelStatusQuery = useChannelConnectorsStatusQuery({ retry: false });
  const diagnosticsQuery = useSystemDiagnosticsQuery({ retry: false });

  const queries = [
    configQuery,
    skillsQuery,
    appConnectionsQuery,
    channelStatusQuery,
    diagnosticsQuery,
  ] as const;

  const connections: ExternalConnection[] = React.useMemo(
    () =>
      buildConnections({
        config: configQuery.data,
        skills: skillsQuery.data,
        appConnections: appConnectionsQuery.data,
        channelStatus: channelStatusQuery.data,
        diagnostics: diagnosticsQuery.data,
      }),
    [
      configQuery.data,
      skillsQuery.data,
      appConnectionsQuery.data,
      channelStatusQuery.data,
      diagnosticsQuery.data,
    ],
  );

  // Loading only while nothing has resolved yet (each source is independent).
  const isLoading = queries.every((q) => q.isLoading);
  // Surface an error only when every source failed; partial failures degrade
  // gracefully (the affected row just shows its empty/warn state).
  const allFailed = queries.every((q) => q.isError);
  const firstError = queries.find((q) => q.isError)?.error ?? null;

  const refetchAll = React.useCallback(() => {
    void configQuery.refetch();
    void skillsQuery.refetch();
    void appConnectionsQuery.refetch();
    void channelStatusQuery.refetch();
    void diagnosticsQuery.refetch();
  }, [
    configQuery,
    skillsQuery,
    appConnectionsQuery,
    channelStatusQuery,
    diagnosticsQuery,
  ]);

  return {
    connections,
    isLoading,
    allFailed,
    error: firstError,
    refetchAll,
    sources: {
      config: configQuery,
      skills: skillsQuery,
      appConnections: appConnectionsQuery,
      channelStatus: channelStatusQuery,
      diagnostics: diagnosticsQuery,
    },
  };
}
