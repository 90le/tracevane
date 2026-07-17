import { controlDebugSession, createDebugSession, evaluateDebugSession, stopDebugSession } from "@/lib/api/debug";
import { resolveWebSocketUrl } from "@/lib/runtime";
import type {
  DebugBreakpointLocation,
  DebugControlAction,
  DebugEvaluateMode,
  DebugEvaluatePayload,
  DebugGatewayServerEvent,
  DebugSessionPayload,
} from "../../../../../../types/debug";

export const DEBUG_GATEWAY_UNAVAILABLE_MESSAGE =
  "当前为 OpenClaw 网关单端口模式，Debug Gateway 实时通道不可用（网关不会把 WebSocket 升级转发给插件）。";

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

export function evaluateIdeDebugSession(
  sessionId: string,
  expression: string,
  mode: DebugEvaluateMode = "evaluate",
): Promise<DebugEvaluatePayload> {
  return evaluateDebugSession({ sessionId, expression, mode });
}

export function createDebugWebSocketUrl(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1/ws/debug";
  return resolveWebSocketUrl("/ws/debug");
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
