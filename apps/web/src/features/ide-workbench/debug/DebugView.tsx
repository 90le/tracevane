import * as React from "react";
import { Bug, CircleStop, Play, TerminalSquare } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { createIdeDebugSession, stopIdeDebugSession } from "./debugClient";
import { upsertDebugSession, useIdeDebugSnapshot } from "./debugStore";

export function IdeDebugView({
  hidden,
  rootId,
  cwd,
  onOpenDebugConsole,
}: {
  hidden: boolean;
  rootId: string;
  cwd: string;
  onOpenDebugConsole: () => void;
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
      });
      upsertDebugSession(payload.session);
    } finally {
      setBusy(false);
    }
  }, [busy, cwd, rootId, snapshot.sessions.length]);

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
