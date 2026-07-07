export type DebugSessionState = "created" | "running" | "stopped" | "terminated" | "error";

export interface DebugProfileDescriptor {
  id: string;
  label: string;
  kind: "mock";
  description: string;
}

export interface DebugStatusPayload {
  ok: true;
  provider: "mock";
  websocketPath: string;
  supportedProfiles: DebugProfileDescriptor[];
  features: string[];
}

export interface DebugSourceLocation {
  rootId: string;
  path: string;
  lineNumber: number;
  column?: number | null;
}

export interface DebugBreakpointLocation extends DebugSourceLocation {
  enabled?: boolean;
}

export interface DebugSessionDescriptor {
  id: string;
  rootId: string;
  workspaceId: string | null;
  cwd: string;
  profileId: string;
  name: string;
  state: DebugSessionState;
  createdAt: string;
  updatedAt: string;
  stoppedReason?: string | null;
  message?: string | null;
  activeLocation?: DebugSourceLocation | null;
}

export interface DebugCreateSessionRequest {
  rootId: string;
  workspaceId?: string | null;
  cwd?: string | null;
  profileId?: string | null;
  name?: string | null;
  breakpoints?: DebugBreakpointLocation[];
}

export interface DebugStopSessionRequest {
  sessionId: string;
}

export interface DebugSessionsPayload {
  sessions: DebugSessionDescriptor[];
}

export interface DebugSessionPayload {
  session: DebugSessionDescriptor;
}

export type DebugGatewayClientEvent =
  | ({ type: "create" } & DebugCreateSessionRequest)
  | ({ type: "stop" } & DebugStopSessionRequest)
  | { type: "list" };

export type DebugGatewayServerEvent =
  | { type: "ready"; provider: "mock"; websocketPath: string; message: string }
  | ({ type: "status" } & DebugStatusPayload)
  | { type: "sessions"; sessions: DebugSessionDescriptor[] }
  | { type: "session"; session: DebugSessionDescriptor }
  | { type: "output"; sessionId: string; category: "console" | "stdout" | "stderr" | "telemetry"; text: string; timestamp: string }
  | ({ type: "stopped"; sessionId: string; reason: string; threadId?: number | null; timestamp: string } & Partial<DebugSourceLocation>)
  | { type: "terminated"; sessionId: string; reason: string; timestamp: string }
  | { type: "error"; sessionId?: string | null; message: string };
