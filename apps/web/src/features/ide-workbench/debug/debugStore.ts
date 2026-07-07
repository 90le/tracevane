import * as React from "react";

import { appendWorkbenchOutput } from "../output";
import type {
  DebugGatewayServerEvent,
  DebugSessionDescriptor,
  DebugStatusPayload,
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
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "info",
      timestamp: event.timestamp,
      text: `Debug session stopped: ${event.reason}`,
    });
    return;
  }
  if (event.type === "terminated") {
    appendConsoleEvent({
      sessionId: event.sessionId,
      level: "info",
      timestamp: event.timestamp,
      text: `Debug session terminated: ${event.reason ?? "terminated"}`,
    });
    return;
  }
  appendConsoleEvent({ level: "error", text: event.message });
}

export function upsertDebugSession(session: DebugSessionDescriptor): void {
  upsertSession(session);
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
