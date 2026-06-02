import type { StudioRealtimeTransportKind } from "../../shared/runtime-config";
import type { TerminalTargetKind } from "../../../../../types/terminal";

export type TerminalTransportMode = "raw-ws" | "gateway-rpc" | "direct-ws" | "disabled";

export interface TerminalTransportPlan {
  mode: TerminalTransportMode;
  useGatewayRpc: boolean;
  useDirectSocket: boolean;
  useHttpStream: boolean;
}

export interface ResolveTerminalTransportPlanInput {
  realtimeTransport: StudioRealtimeTransportKind;
  realtimeEnabled: boolean;
  directSocketUrl: string;
  directSocketActive: boolean;
  directSocketFailed: boolean;
  httpStreamFailed: boolean;
}

export interface TerminalSocketUrlInput {
  protocol: string;
  host: string;
  webSocketBasePath: string;
  directSocketUrl?: string;
  sid: string;
  profileId?: string | null;
  targetKind?: TerminalTargetKind | null;
  cwd?: string | null;
  pinned?: boolean | null;
  lastSeq?: number;
  instanceId?: string;
  skipReplay?: boolean;
  resume?: boolean;
}

function normalizeBasePath(basePath: string): string {
  const normalized = String(basePath || "").trim().replace(/\/+$/g, "");
  if (!normalized || normalized === "/") return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function resolveTerminalTransportPlan(
  input: ResolveTerminalTransportPlanInput,
): TerminalTransportPlan {
  if (!input.realtimeEnabled || input.realtimeTransport === "disabled") {
    return {
      mode: "disabled",
      useGatewayRpc: false,
      useDirectSocket: false,
      useHttpStream: false,
    };
  }

  const useDirectSocket =
    input.realtimeTransport === "gateway-rpc" &&
    !input.directSocketFailed &&
    Boolean(input.directSocketUrl);
  const useGatewayRpc =
    input.realtimeTransport === "gateway-rpc" && !input.directSocketActive && !useDirectSocket;

  return {
    mode: useDirectSocket
      ? "direct-ws"
      : useGatewayRpc
        ? "gateway-rpc"
        : "raw-ws",
    useGatewayRpc,
    useDirectSocket,
    useHttpStream: useGatewayRpc && !input.httpStreamFailed,
  };
}

export function buildTerminalSocketUrl(input: TerminalSocketUrlInput): string {
  const query = new URLSearchParams({ sid: input.sid });
  if (input.profileId) query.set("profileId", input.profileId);
  if (input.targetKind) query.set("targetKind", input.targetKind);
  if (input.cwd) query.set("cwd", input.cwd);
  if (typeof input.pinned === "boolean") query.set("pinned", input.pinned ? "1" : "0");
  if (input.lastSeq && input.lastSeq > 0) query.set("lastSeq", String(input.lastSeq));
  if (input.instanceId) query.set("instanceId", input.instanceId);
  if (input.skipReplay) query.set("skipReplay", "1");
  if (input.resume) query.set("resume", "1");

  if (input.directSocketUrl) {
    return `${input.directSocketUrl}?${query.toString()}`;
  }

  const wsPath = `${normalizeBasePath(input.webSocketBasePath)}/ws/terminal`;
  return `${input.protocol}//${input.host}${wsPath}?${query.toString()}`;
}
