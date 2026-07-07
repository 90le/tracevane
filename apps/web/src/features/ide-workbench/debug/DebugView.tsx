import * as React from "react";
import { Bug, Circle, CircleDot, CircleStop, ExternalLink, Play, TerminalSquare, Trash2 } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { createIdeDebugSession, stopIdeDebugSession } from "./debugClient";
import {
  removeDebugBreakpoint,
  setDebugBreakpointEnabled,
  upsertDebugSession,
  useIdeDebugSnapshot,
} from "./debugStore";
import type { DebugSourceLocation } from "../../../../../../types/debug";

export function IdeDebugView({
  hidden,
  rootId,
  cwd,
  onOpenDebugConsole,
  onOpenLocation,
}: {
  hidden: boolean;
  rootId: string;
  cwd: string;
  onOpenDebugConsole: () => void;
  onOpenLocation: (location: DebugSourceLocation) => void;
}) {
  const snapshot = useIdeDebugSnapshot();
  const [busy, setBusy] = React.useState(false);
  const activeSession = snapshot.sessions.find((session) => session.state !== "terminated") ?? snapshot.sessions[0] ?? null;

  const handleStart = React.useCallback(async () => {
    if (!rootId || busy) return;
    setBusy(true);
    try {
      const payload = await createIdeDebugSession({
        rootId,
        cwd,
        name: `Mock Debug ${snapshot.sessions.length + 1}`,
        breakpoints: snapshot.breakpoints.filter((breakpoint) => breakpoint.enabled !== false),
      });
      upsertDebugSession(payload.session);
      if (payload.session.activeLocation) onOpenLocation(payload.session.activeLocation);
    } finally {
      setBusy(false);
    }
  }, [busy, cwd, onOpenLocation, rootId, snapshot.breakpoints, snapshot.sessions.length]);

  const handleStop = React.useCallback(async () => {
    if (!activeSession || activeSession.state === "terminated" || busy) return;
    setBusy(true);
    try {
      const payload = await stopIdeDebugSession(activeSession.id);
      upsertDebugSession(payload.session);
    } finally {
      setBusy(false);
    }
  }, [activeSession, busy]);

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;

  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-r border-line bg-panel" data-ide-sidebar data-ide-debug-view>
      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center gap-2">
          <Bug className="size-4 text-primary" />
          <div className="min-w-0 flex-1 font-semibold text-ink-strong">运行和调试</div>
        </div>
        <div className="mt-1 text-xs text-muted" data-ide-debug-status>
          {snapshot.connectionState === "connected" ? "Debug Gateway 已连接" : snapshot.message ?? "Debug Gateway 等待连接"}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={handleStart} disabled={!rootId || busy} data-ide-debug-start>
            <Play />
            启动 Mock
          </Button>
          <Button size="sm" variant="outline" onClick={handleStop} disabled={!activeSession || activeSession.state === "terminated" || busy} data-ide-debug-stop>
            <CircleStop />
            停止
          </Button>
        </div>
        <Button className="mt-2 w-full justify-start" size="sm" variant="ghost" onClick={onOpenDebugConsole} data-ide-debug-open-console>
          <TerminalSquare />
          打开 Debug Console
        </Button>
      </div>
      <div className="min-h-0 overflow-auto p-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Breakpoints</div>
        {snapshot.breakpoints.length ? (
          <div className="mb-4 space-y-1">
            {snapshot.breakpoints.map((breakpoint) => {
              const active = snapshot.activeStoppedLocation
                ? breakpoint.rootId === snapshot.activeStoppedLocation.rootId
                  && breakpoint.path === snapshot.activeStoppedLocation.path
                  && breakpoint.lineNumber === snapshot.activeStoppedLocation.lineNumber
                : false;
              return (
                <div
                  key={`${breakpoint.rootId}:${breakpoint.path}:${breakpoint.lineNumber}`}
                  className={cn(
                    "group rounded-md border bg-canvas px-2 py-2 text-sm",
                    active ? "border-primary-line ring-1 ring-primary-line" : "border-line",
                  )}
                  data-ide-debug-breakpoint-row
                  data-ide-debug-breakpoint-path={breakpoint.path}
                  data-ide-debug-breakpoint-line={breakpoint.lineNumber}
                  data-ide-debug-breakpoint-active={active ? "true" : "false"}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      className="rounded-sm text-red hover:bg-red-soft"
                      aria-label={breakpoint.enabled === false ? "启用断点" : "禁用断点"}
                      onClick={() => setDebugBreakpointEnabled(breakpoint, breakpoint.enabled === false)}
                    >
                      {breakpoint.enabled === false ? <Circle className="size-4" /> : <CircleDot className="size-4" />}
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-xs text-ink-strong hover:text-primary"
                      onClick={() => onOpenLocation(breakpoint)}
                    >
                      {breakpoint.path}:{breakpoint.lineNumber}
                    </button>
                    <button
                      type="button"
                      className="rounded-sm p-1 text-muted hover:bg-panel-2 hover:text-primary"
                      aria-label="打开断点位置"
                      onClick={() => onOpenLocation(breakpoint)}
                    >
                      <ExternalLink className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-sm p-1 text-muted hover:bg-red-soft hover:text-red"
                      aria-label="删除断点"
                      onClick={() => removeDebugBreakpoint(breakpoint)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-line bg-canvas p-3 text-sm text-muted" data-ide-debug-breakpoints-empty>
            在 Monaco 编辑器行号/断点栏点击可添加断点；启动 Mock 后会停在首个启用断点。
          </div>
        )}
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Sessions</div>
        {snapshot.sessions.length ? (
          <div className="space-y-1">
            {snapshot.sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-md border border-line bg-canvas px-2 py-2 text-sm"
                data-ide-debug-session
                data-ide-debug-session-state={session.state}
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "size-2 rounded-full",
                    session.state === "terminated" ? "bg-muted" : session.state === "error" ? "bg-danger" : "bg-primary",
                  )} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{session.name}</span>
                  <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-muted">{session.state}</span>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-muted">cwd: {session.cwd || "."}</div>
                {session.message ? <div className="mt-1 text-xs text-subtle">{session.message}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-line bg-canvas p-3 text-sm text-muted" data-ide-debug-empty>
            还没有 Debug session。当前阶段只提供 mock provider 骨架，用于验证 Gateway / Debug View / Debug Console 闭环。
          </div>
        )}
      </div>
    </aside>
  );
}
