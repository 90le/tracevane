import * as React from "react";

import { useSystemHealthQuery, useOpenClawRecoveryStatusQuery } from "@/lib/query/dashboard";
import { useModelGatewayStatusQuery } from "@/lib/query/model-gateway";
import { useChannelConnectorsStatusQuery } from "@/lib/query/channel-connectors";
import { useSystemDiagnosticsQuery } from "@/lib/query/external";

import type {
  OpenClawRecoveryStatusPayload,
  PlatformCard,
  PlatformTone,
  SystemDiagnosticsPayload,
  SystemHealthPayload,
} from "./types";

/** Map a recovery state kind to a display tone. */
function recoveryTone(status: OpenClawRecoveryStatusPayload["status"] | undefined): PlatformTone {
  switch (status) {
    case "healthy":
      return "ok";
    case "repairing":
    case "degraded":
      return "warn";
    case "failed":
      return "bad";
    default:
      return "info";
  }
}

/** OpenClaw runtime row tone: gateway online + recovery healthy = ok. */
function openClawTone(
  health: SystemHealthPayload | undefined,
  recovery: OpenClawRecoveryStatusPayload | undefined,
): PlatformTone {
  if (!health && !recovery) return "info";
  const gatewayUp = health?.gateway === "online" || health?.gatewayConnected === true;
  const recoveryOk = recovery?.status === "healthy";
  if (recovery?.status === "failed") return "bad";
  if (gatewayUp && (recoveryOk || recovery == null)) return "ok";
  if (gatewayUp || recoveryOk) return "warn";
  return "bad";
}

/**
 * Derive an openable OpenClaw Control / Web UI URL from diagnostics. The
 * gateway WS url (`ws://host:port`) + control UI base path give the http URL.
 * Returns null when it cannot be derived (we then surface an honest note
 * instead of inventing an endpoint).
 */
export function deriveControlUiUrl(
  diagnostics: SystemDiagnosticsPayload | undefined,
): string | null {
  const cfg = diagnostics?.config;
  if (!cfg?.gatewayWsUrl) return null;
  let httpBase: string;
  try {
    const ws = new URL(cfg.gatewayWsUrl);
    const scheme = ws.protocol === "wss:" ? "https:" : "http:";
    httpBase = `${scheme}//${ws.host}`;
  } catch {
    return null;
  }
  const basePath = cfg.gatewayControlUiBasePath?.trim();
  if (!basePath || basePath === "/") return httpBase;
  const normalized = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return `${httpBase}${normalized.replace(/\/$/, "")}`;
}

/**
 * Loads every source the platform overview synthesizes and builds the derived
 * platform-card view-model. All hooks are REUSED from their owning data layers
 * (dashboard / model-gateway / channel-connectors / external) — nothing is
 * re-bound here. Exposes aggregate loading/error + the raw source queries so
 * views can render three-states + refetch and the OpenClaw summary can read
 * fields directly.
 */
export function usePlatformsAggregate() {
  const healthQuery = useSystemHealthQuery({ retry: false });
  const recoveryQuery = useOpenClawRecoveryStatusQuery({ retry: false });
  const gatewayQuery = useModelGatewayStatusQuery({ retry: false });
  const channelQuery = useChannelConnectorsStatusQuery({ retry: false });
  const diagnosticsQuery = useSystemDiagnosticsQuery({ retry: false });

  const queries = [
    healthQuery,
    recoveryQuery,
    gatewayQuery,
    channelQuery,
    diagnosticsQuery,
  ] as const;

  const cards: PlatformCard[] = React.useMemo(() => {
    const health = healthQuery.data;
    const recovery = recoveryQuery.data;
    const ocTone = openClawTone(health, recovery);
    const gatewayUp = health?.gateway === "online" || health?.gatewayConnected === true;
    const recState = recovery?.status;

    return [
      {
        id: "openclaw",
        title: "OpenClaw",
        category: "底层运行时 · Control UI · CLI",
        summary: health?.version
          ? `运行时 v${health.version} · ${gatewayUp ? "网关在线" : "网关离线"}${recState ? ` · 自愈 ${recState}` : ""}`
          : recState
            ? `自愈 ${recState}${gatewayUp ? " · 网关在线" : ""}`
            : "运行时身份未就绪",
        status: ocTone === "ok" ? "已连接" : ocTone === "bad" ? "异常" : "需关注",
        tone: ocTone,
        boundary:
          "OpenClaw 是底层平台支撑：配置 / agents / channels / skills / service 的通用管理留在官方 OpenClaw UI；宿主恢复并入平台守护。",
        primary: { label: "查看 OpenClaw 平台", to: "/platforms/openclaw" },
        secondary: { label: "平台守护", to: "/platforms/openclaw/guard" },
      },
    ];
  }, [healthQuery.data, recoveryQuery.data]);

  const isLoading = queries.every((q) => q.isLoading);
  const allFailed = queries.every((q) => q.isError);
  const firstError = queries.find((q) => q.isError)?.error ?? null;

  const refetchAll = React.useCallback(() => {
    void healthQuery.refetch();
    void recoveryQuery.refetch();
    void gatewayQuery.refetch();
    void channelQuery.refetch();
    void diagnosticsQuery.refetch();
  }, [healthQuery, recoveryQuery, gatewayQuery, channelQuery, diagnosticsQuery]);

  return {
    cards,
    isLoading,
    allFailed,
    error: firstError,
    refetchAll,
    sources: {
      health: healthQuery,
      recovery: recoveryQuery,
      gateway: gatewayQuery,
      channel: channelQuery,
      diagnostics: diagnosticsQuery,
    },
    recoveryTone,
  };
}
