import type {
  TerminalEndResponse,
  TerminalGatewayAttachPayload,
  TerminalSessionDescriptor,
} from "@/features/cli-agents/types";
import { createTerminalSession, endTerminalSession } from "@/lib/api/terminal";

export type WorkbenchTerminalEvent =
  | {
      type: "session";
      sid: string;
      instanceId: string;
      outputSeq: number;
      descriptor?: TerminalSessionDescriptor;
    }
  | { type: "output"; sid: string; seq: number; data: string; emittedAtMs?: number }
  | { type: "closed"; sid: string; reason: "session_ended" | "session_exited" }
  | { type: "error"; sid?: string; message: string }
  | { type: "reset"; sid: string; instanceId: string; reason: "session_recreated" | "backlog_gap" }
  | { type: "clear"; sid: string; instanceId: string; clearedThroughSeq: number }
  | { type: "pong" };

export interface CreateWorkbenchTerminalOptions {
  rootId: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

declare global {
  interface Window {
    __TRACEVANE_RUNTIME__?: {
      webSocketBasePath?: string;
      realtimeTransport?: string;
      features?: { terminalRealtime?: boolean };
    };
  }
}

export function createWorkbenchTerminalSession(
  options: CreateWorkbenchTerminalOptions,
): Promise<TerminalSessionDescriptor> {
  const payload: TerminalGatewayAttachPayload = {
    sid: `ide-terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    rootId: options.rootId,
    workspaceId: options.rootId,
    cwd: normalizeRelativeCwd(options.cwd),
    profileId: "local-shell",
    shell: "bash",
    targetKind: "local",
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    pinned: true,
    skipReplay: true,
  };
  return createTerminalSession(payload);
}

export function endWorkbenchTerminalSession(sessionId: string): Promise<TerminalEndResponse> {
  return endTerminalSession({ sid: sessionId });
}

export function createTerminalWebSocketUrl(
  sessionId: string,
  options: CreateWorkbenchTerminalOptions,
): string {
  const runtime = window.__TRACEVANE_RUNTIME__;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const basePath = normalizeBasePath(runtime?.webSocketBasePath ?? "");
  const params = new URLSearchParams({
    sid: sessionId,
    rootId: options.rootId,
    workspaceId: options.rootId,
    cwd: normalizeRelativeCwd(options.cwd),
    profileId: "local-shell",
    shell: "bash",
    targetKind: "local",
    resume: "1",
    skipReplay: "1",
  });
  return `${protocol}//${window.location.host}${basePath}/ws/terminal?${params.toString()}`;
}

export function parseTerminalEvent(raw: MessageEvent<string>): WorkbenchTerminalEvent | null {
  try {
    const parsed = JSON.parse(String(raw.data || ""));
    return parsed && typeof parsed === "object" && typeof parsed.type === "string"
      ? (parsed as WorkbenchTerminalEvent)
      : null;
  } catch {
    return null;
  }
}

export function normalizeRelativeCwd(value: string | null | undefined): string {
  const raw = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw || raw === ".") return "";
  if (raw === ".." || raw.startsWith("../")) return "";
  return raw;
}

function normalizeBasePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}
