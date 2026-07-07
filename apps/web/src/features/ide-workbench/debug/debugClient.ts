import { controlDebugSession, createDebugSession, stopDebugSession } from "@/lib/api/debug";
import type {
  DebugBreakpointLocation,
  DebugControlAction,
  DebugGatewayServerEvent,
  DebugSessionPayload,
} from "../../../../../../types/debug";

export interface IdeDebugCreateInput {
  rootId: string;
  cwd: string;
  name?: string;
  profileId?: string;
  breakpoints?: DebugBreakpointLocation[];
  program?: string | null;
  args?: string[];
  env?: Record<string, string>;
}

export function createIdeDebugSession(input: IdeDebugCreateInput): Promise<DebugSessionPayload> {
  return createDebugSession({
    rootId: input.rootId,
    cwd: input.cwd,
    name: input.name,
    profileId: input.profileId ?? "mock-node",
    breakpoints: input.breakpoints,
    program: input.program,
    args: input.args,
    env: input.env,
  });
}

export function stopIdeDebugSession(sessionId: string): Promise<DebugSessionPayload> {
  return stopDebugSession({ sessionId });
}

export function controlIdeDebugSession(sessionId: string, action: DebugControlAction): Promise<DebugSessionPayload> {
  return controlDebugSession({ sessionId, action });
}

export function createDebugWebSocketUrl(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1/ws/debug";
  const basePath = normalizeBasePath((window as typeof window & { __TRACEVANE_BASE_PATH__?: string }).__TRACEVANE_BASE_PATH__);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${basePath}/ws/debug`;
}

export function parseDebugGatewayEvent(data: unknown): DebugGatewayServerEvent | null {
  try {
    const parsed = JSON.parse(String(data ?? ""));
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") return null;
    return parsed as DebugGatewayServerEvent;
  } catch {
    return null;
  }
}

function normalizeBasePath(value: string | undefined): string {
  if (!value) return "";
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
