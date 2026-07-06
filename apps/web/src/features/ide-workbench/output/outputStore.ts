import * as React from "react";

export type WorkbenchOutputChannelKind = "system" | "task" | "terminal" | "search" | "extension" | "watcher" | "custom";
export type WorkbenchOutputLevel = "debug" | "info" | "warn" | "error";

export interface WorkbenchOutputChannel {
  id: string;
  label: string;
  kind: WorkbenchOutputChannelKind;
}

export interface WorkbenchOutputEvent {
  channelId: string;
  sequence: number;
  timestamp: string;
  level: WorkbenchOutputLevel;
  text: string;
}

export interface WorkbenchOutputAppendInput {
  channel?: Partial<WorkbenchOutputChannel> & Pick<WorkbenchOutputChannel, "id">;
  channelId?: string;
  level?: WorkbenchOutputLevel;
  text: string;
  timestamp?: string;
}

export interface WorkbenchOutputSnapshot {
  channels: WorkbenchOutputChannel[];
  events: WorkbenchOutputEvent[];
}

const OUTPUT_EVENT = "tracevane:ide-output";
const MAX_OUTPUT_EVENTS = 2_000;
let channels: WorkbenchOutputChannel[] = [
  { id: "system", label: "System", kind: "system" },
  { id: "watcher", label: "Watcher", kind: "watcher" },
];
let events: WorkbenchOutputEvent[] = [];
let snapshot: WorkbenchOutputSnapshot = { channels, events };
let sequence = 0;
let browserListenerInstalled = false;
const listeners = new Set<() => void>();

export function appendWorkbenchOutput(input: WorkbenchOutputAppendInput): WorkbenchOutputEvent {
  const channel = normalizeChannel(input);
  upsertChannel(channel);
  const event: WorkbenchOutputEvent = {
    channelId: channel.id,
    sequence: ++sequence,
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level ?? "info",
    text: String(input.text ?? ""),
  };
  events = [...events, event].slice(-MAX_OUTPUT_EVENTS);
  refreshOutputSnapshot();
  emitOutputChanged();
  return event;
}

export function clearWorkbenchOutput(channelId?: string) {
  const next = channelId ? events.filter((event) => event.channelId !== channelId) : [];
  if (next.length === events.length) return;
  events = next;
  refreshOutputSnapshot();
  emitOutputChanged();
}

export function getWorkbenchOutputSnapshot(): WorkbenchOutputSnapshot {
  return snapshot;
}

export function subscribeWorkbenchOutput(listener: () => void) {
  installBrowserOutputListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkbenchOutput() {
  installBrowserOutputListener();
  return React.useSyncExternalStore(
    subscribeWorkbenchOutput,
    getWorkbenchOutputSnapshot,
    getWorkbenchOutputSnapshot,
  );
}

function normalizeChannel(input: WorkbenchOutputAppendInput): WorkbenchOutputChannel {
  const id = input.channel?.id ?? input.channelId ?? "system";
  const existing = channels.find((channel) => channel.id === id);
  return {
    id,
    label: input.channel?.label ?? existing?.label ?? id,
    kind: input.channel?.kind ?? existing?.kind ?? "custom",
  };
}

function upsertChannel(channel: WorkbenchOutputChannel) {
  const existing = channels.find((item) => item.id === channel.id);
  channels = existing
    ? channels.map((item) => item.id === channel.id ? { ...item, ...channel } : item)
    : [...channels, channel];
  refreshOutputSnapshot();
}

function refreshOutputSnapshot() {
  snapshot = { channels, events };
}

function emitOutputChanged() {
  for (const listener of listeners) listener();
}

function installBrowserOutputListener() {
  if (browserListenerInstalled || typeof window === "undefined") return;
  browserListenerInstalled = true;
  window.addEventListener(OUTPUT_EVENT, (event) => {
    const detail = (event as CustomEvent<WorkbenchOutputAppendInput>).detail;
    if (!detail || typeof detail !== "object" || typeof detail.text !== "string") return;
    appendWorkbenchOutput(detail);
  });
}

installBrowserOutputListener();
