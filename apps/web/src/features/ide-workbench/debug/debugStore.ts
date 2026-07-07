import * as React from "react";

import { appendWorkbenchOutput } from "../output";
import type {
  DebugBreakpointLocation,
  DebugGatewayServerEvent,
  DebugScope,
  DebugSourceLocation,
  DebugSessionDescriptor,
  DebugStackFrame,
  DebugStatusPayload,
  DebugVariable,
} from "../../../../../../types/debug";

export interface IdeDebugConsoleEvent {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  sessionId?: string;
  text: string;
}

export interface IdeDebugSnapshot {
  connected: boolean;
  connectionState: "idle" | "connecting" | "connected" | "disconnected" | "error";
  message: string | null;
  status: DebugStatusPayload | null;
  sessions: DebugSessionDescriptor[];
  events: IdeDebugConsoleEvent[];
  breakpoints: DebugBreakpointLocation[];
  activeStoppedLocation: (DebugSourceLocation & { sessionId: string; reason: string }) | null;
  stackFramesBySessionId: Record<string, DebugStackFrame[]>;
  scopesBySessionId: Record<string, DebugScope[]>;
  variablesBySessionId: Record<string, DebugVariable[]>;
}

const MAX_DEBUG_EVENTS = 1_000;
const listeners = new Set<() => void>();
let sequence = 0;
let snapshot: IdeDebugSnapshot = {
  connected: false,
  connectionState: "idle",
  message: null,
  status: null,
  sessions: [],
  events: [],
  breakpoints: [],
  activeStoppedLocation: null,
  stackFramesBySessionId: {},
  scopesBySessionId: {},
  variablesBySessionId: {},
};

export function useIdeDebugSnapshot(): IdeDebugSnapshot {
  return React.useSyncExternalStore(subscribeIdeDebugStore, getIdeDebugSnapshot, getIdeDebugSnapshot);
}

export function getIdeDebugSnapshot(): IdeDebugSnapshot {
  return snapshot;
}

export function subscribeIdeDebugStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDebugGatewayConnectionState(
  state: IdeDebugSnapshot["connectionState"],
  message: string | null = null,
): void {
  snapshot = {
    ...snapshot,
    connected: state === "connected",
    connectionState: state,
    message,
  };
  emitChanged();
}

export function applyDebugGatewayEvent(event: DebugGatewayServerEvent): void {
  if (event.type === "ready") {
    snapshot = { ...snapshot, connected: true, connectionState: "connected", message: event.message };
    appendConsoleEvent({ level: "info", text: event.message ?? "Debug gateway ready" });
    return;
  }
  if (event.type === "status") {
    const { type: _type, ...status } = event;
    void _type;
    snapshot = { ...snapshot, status };
    emitChanged();
    return;
  }
  if (event.type === "sessions") {
    snapshot = { ...snapshot, sessions: event.sessions };
    emitChanged();
    return;
  }
  if (event.type === "session") {
    upsertSession(event.session);
    return;
  }
  if (event.type === "lifecycle") {
    snapshot = {
      ...snapshot,
      sessions: snapshot.sessions.map((session) =>
        session.id === event.sessionId
          ? {
              ...session,
              state: event.state,
              lifecycleEvent: event.event,
              updatedAt: event.timestamp,
              message: event.message ?? session.message ?? null,
              terminationReason: event.event === "terminated" ? event.reason ?? session.terminationReason ?? null : session.terminationReason ?? null,
              lastError: event.event === "error" ? event.message ?? event.reason ?? session.lastError ?? null : session.lastError ?? null,
            }
          : session,
      ),
    };
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: event.event === "error" ? "error" : event.event === "disconnected" ? "warn" : "debug",
      timestamp: event.timestamp,
      text: `Debug lifecycle ${event.event}: ${event.message ?? event.reason ?? event.state}`,
    });
    return;
  }
  if (event.type === "output") {
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: event.category === "stderr" ? "warn" : "info",
      timestamp: event.timestamp,
      text: event.text,
    });
    return;
  }
  if (event.type === "stopped") {
    const activeStoppedLocation = hasDebugSourceLocation(event)
      ? {
          rootId: event.rootId,
          path: event.path,
          lineNumber: event.lineNumber,
          column: event.column ?? 1,
          sessionId: event.sessionId,
          reason: event.reason,
        }
      : snapshot.activeStoppedLocation;
    snapshot = { ...snapshot, activeStoppedLocation };
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "info",
      timestamp: event.timestamp,
      text: hasDebugSourceLocation(event)
        ? `Debug session stopped: ${event.reason} at ${event.path}:${event.lineNumber}`
        : `Debug session stopped: ${event.reason}`,
    });
    return;
  }
  if (event.type === "stackTrace") {
    snapshot = {
      ...snapshot,
      stackFramesBySessionId: {
        ...snapshot.stackFramesBySessionId,
        [event.sessionId]: event.frames,
      },
    };
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "debug",
      timestamp: event.timestamp,
      text: `Debug stack trace received: ${event.frames.length} frame(s)`,
    });
    return;
  }
  if (event.type === "variables") {
    snapshot = {
      ...snapshot,
      variablesBySessionId: {
        ...snapshot.variablesBySessionId,
        [event.sessionId]: event.variables,
      },
    };
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "debug",
      timestamp: event.timestamp,
      text: `Debug variables received: ${event.variables.length} item(s)`,
    });
    return;
  }
  if (event.type === "scopes") {
    snapshot = {
      ...snapshot,
      scopesBySessionId: {
        ...snapshot.scopesBySessionId,
        [event.sessionId]: event.scopes,
      },
    };
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "debug",
      timestamp: event.timestamp,
      text: `Debug scopes received: ${event.scopes.length} scope(s)`,
    });
    return;
  }
  if (event.type === "terminated") {
    const terminatedSession = snapshot.sessions.find((session) => session.id === event.sessionId);
    snapshot = {
      ...snapshot,
      activeStoppedLocation: snapshot.activeStoppedLocation?.sessionId === event.sessionId
        ? null
        : snapshot.activeStoppedLocation,
      sessions: terminatedSession
        ? snapshot.sessions.map((session) =>
            session.id === event.sessionId
              ? { ...session, state: "terminated", stoppedReason: event.reason, updatedAt: event.timestamp }
              : session,
          )
        : snapshot.sessions,
    };
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "info",
      timestamp: event.timestamp,
      text: `Debug session terminated: ${event.reason ?? "terminated"}`,
    });
    return;
  }
  if (event.sessionId) {
    snapshot = {
      ...snapshot,
      sessions: snapshot.sessions.map((session) =>
        session.id === event.sessionId
          ? { ...session, state: "error", lastError: event.message, lifecycleEvent: "error", message: event.message }
          : session,
      ),
    };
  }
  appendConsoleEvent({ sessionId: event.sessionId ?? undefined, level: "error", text: event.message });
}

export function upsertDebugSession(session: DebugSessionDescriptor): void {
  upsertSession(session);
}

export function toggleDebugBreakpoint(input: DebugSourceLocation): DebugBreakpointLocation | null {
  if (!input.rootId || !input.path || input.lineNumber < 1) return null;
  const existing = snapshot.breakpoints.find((breakpoint) =>
    sameDebugSourceLocation(breakpoint, input),
  );
  const breakpoints = existing
    ? snapshot.breakpoints.filter((breakpoint) => !sameDebugSourceLocation(breakpoint, input))
    : [
        ...snapshot.breakpoints,
        {
          rootId: input.rootId,
          path: input.path,
          lineNumber: input.lineNumber,
          column: input.column ?? 1,
          enabled: true,
        },
      ].sort(compareDebugBreakpoints);
  snapshot = { ...snapshot, breakpoints };
  emitChanged();
  return existing ?? breakpoints.find((breakpoint) => sameDebugSourceLocation(breakpoint, input)) ?? null;
}

export function removeDebugBreakpoint(input: DebugSourceLocation): void {
  snapshot = {
    ...snapshot,
    breakpoints: snapshot.breakpoints.filter((breakpoint) => !sameDebugSourceLocation(breakpoint, input)),
  };
  emitChanged();
}

export function setDebugBreakpointEnabled(input: DebugSourceLocation, enabled: boolean): void {
  snapshot = {
    ...snapshot,
    breakpoints: snapshot.breakpoints.map((breakpoint) =>
      sameDebugSourceLocation(breakpoint, input) ? { ...breakpoint, enabled } : breakpoint,
    ),
  };
  emitChanged();
}

function upsertSession(session: DebugSessionDescriptor): void {
  const existing = snapshot.sessions.find((item) => item.id === session.id);
  const sessions = existing
    ? snapshot.sessions.map((item) => item.id === session.id ? session : item)
    : [session, ...snapshot.sessions];
  snapshot = { ...snapshot, sessions };
  emitChanged();
}

function appendConsoleEvent(input: Omit<IdeDebugConsoleEvent, "id" | "timestamp"> & { timestamp?: string }): void {
  const event: IdeDebugConsoleEvent = {
    id: `debug-event-${++sequence}`,
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level,
    sessionId: input.sessionId,
    text: input.text,
  };
  snapshot = { ...snapshot, events: [...snapshot.events, event].slice(-MAX_DEBUG_EVENTS) };
  appendWorkbenchOutput({
    channel: { id: "debug", label: "Debug", kind: "debug" },
    level: input.level,
    text: input.sessionId ? `[${input.sessionId}] ${input.text}` : input.text,
    timestamp: event.timestamp,
  });
  emitChanged();
}

function emitChanged(): void {
  for (const listener of listeners) listener();
}

function hasDebugSourceLocation(
  event: DebugGatewayServerEvent,
): event is Extract<DebugGatewayServerEvent, { type: "stopped" }> & DebugSourceLocation {
  return event.type === "stopped"
    && typeof event.rootId === "string"
    && event.rootId.length > 0
    && typeof event.path === "string"
    && event.path.length > 0
    && typeof event.lineNumber === "number"
    && Number.isFinite(event.lineNumber)
    && event.lineNumber > 0;
}

function sameDebugSourceLocation(a: DebugSourceLocation, b: DebugSourceLocation): boolean {
  return a.rootId === b.rootId && a.path === b.path && a.lineNumber === b.lineNumber;
}

function compareDebugBreakpoints(a: DebugBreakpointLocation, b: DebugBreakpointLocation): number {
  return a.rootId.localeCompare(b.rootId)
    || a.path.localeCompare(b.path)
    || a.lineNumber - b.lineNumber;
}
