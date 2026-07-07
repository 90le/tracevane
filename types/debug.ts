export type DebugSessionState =
  | "created"
  | "initializing"
  | "configured"
  | "running"
  | "stopped"
  | "terminating"
  | "terminated"
  | "disconnected"
  | "error";

export type DebugLifecycleEventKind =
  | "created"
  | "initialized"
  | "configured"
  | "running"
  | "stopped"
  | "terminating"
  | "terminated"
  | "disconnected"
  | "error";

export interface DebugProfileDescriptor {
  id: string;
  label: string;
  kind: "mock" | "adapter-proof";
  description: string;
  requiresProgram?: boolean;
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
  lifecycleEvent?: DebugLifecycleEventKind | null;
  terminationReason?: string | null;
  lastError?: string | null;
  activeLocation?: DebugSourceLocation | null;
  adapterKind?: DebugProfileDescriptor["kind"];
  program?: string | null;
}

export interface DebugLifecycleEvent {
  type: "lifecycle";
  sessionId: string;
  state: DebugSessionState;
  event: DebugLifecycleEventKind;
  message?: string | null;
  reason?: string | null;
  timestamp: string;
}

export interface DebugStackFrame {
  id: number;
  name: string;
  source: DebugSourceLocation;
}

export interface DebugVariable {
  name: string;
  value: string;
  type?: string | null;
  variablesReference?: number;
}

export interface DebugCreateSessionRequest {
  rootId: string;
  workspaceId?: string | null;
  cwd?: string | null;
  profileId?: string | null;
  name?: string | null;
  breakpoints?: DebugBreakpointLocation[];
  program?: string | null;
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
  | DebugLifecycleEvent
  | { type: "output"; sessionId: string; category: "console" | "stdout" | "stderr" | "telemetry"; text: string; timestamp: string }
  | ({ type: "stopped"; sessionId: string; reason: string; threadId?: number | null; timestamp: string } & Partial<DebugSourceLocation>)
  | { type: "stackTrace"; sessionId: string; threadId: number; frames: DebugStackFrame[]; timestamp: string }
  | { type: "variables"; sessionId: string; frameId: number; variables: DebugVariable[]; timestamp: string }
  | { type: "terminated"; sessionId: string; reason: string; timestamp: string }
  | { type: "error"; sessionId?: string | null; message: string };
