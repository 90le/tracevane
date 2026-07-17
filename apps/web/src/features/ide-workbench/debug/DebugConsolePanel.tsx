import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { evaluateIdeDebugSession } from "./debugClient";
import { useIdeDebugSnapshot } from "./debugStore";
import type { DebugEvaluateMode } from "../../../../../../types/debug";

export function DebugConsolePanel() {
  const snapshot = useIdeDebugSnapshot();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [expression, setExpression] = React.useState("session.state");
  const [busyMode, setBusyMode] = React.useState<DebugEvaluateMode | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const activeSession = snapshot.sessions.find((session) => !["terminated", "disconnected", "error"].includes(session.state))
    ?? snapshot.sessions[0]
    ?? null;
  const canEvaluate = Boolean(activeSession && expression.trim() && !busyMode);

  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [snapshot.events.length, snapshot.evaluations.length, snapshot.watches.length]);

  const handleEvaluate = React.useCallback(async (mode: DebugEvaluateMode) => {
    if (!activeSession || !expression.trim() || busyMode) return;
    setBusyMode(mode);
    setError(null);
    try {
      await evaluateIdeDebugSession(activeSession.id, expression.trim(), mode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyMode(null);
    }
  }, [activeSession, busyMode, expression]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    void handleEvaluate("evaluate");
  }, [handleEvaluate]);

  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-canvas" data-ide-debug-console-panel>
      <div className="flex min-h-8 items-center justify-between gap-3 border-b border-line px-3 text-xs text-muted">
        <span className="shrink-0">Debug Console</span>
        <span className="min-w-0 truncate">
          {snapshot.sessions.length} 个会话 · {snapshot.events.length} 条事件 · {snapshot.watches.length} 个监视
        </span>
      </div>
      <div ref={scrollerRef} className="min-h-0 overflow-auto p-3 font-mono text-xs leading-5">
        {snapshot.watches.length ? (
          <section className="mb-3 rounded-md border border-line bg-panel/80 p-2 font-sans" data-ide-debug-watch-list>
            <div className="mb-1 text-xs font-semibold text-ink-strong">监视</div>
            <div className="grid gap-1">
              {snapshot.watches.map((watch) => (
                <div key={`${watch.sessionId}:${watch.expression}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded bg-canvas px-2 py-1 text-xs" data-ide-debug-watch-result>
                  <span className="truncate font-mono text-ink">{watch.expression}</span>
                  <span className="truncate font-mono text-primary" title={watch.value}>{watch.value}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {snapshot.evaluations.length ? (
          <section className="mb-3 rounded-md border border-line bg-panel/80 p-2 font-sans" data-ide-debug-evaluation-list>
            <div className="mb-1 text-xs font-semibold text-ink-strong">求值</div>
            <div className="grid gap-1">
              {snapshot.evaluations.slice(-5).map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded bg-canvas px-2 py-1 text-xs" data-ide-debug-evaluation-result>
                  <span className="truncate font-mono text-ink">{item.expression}</span>
                  <span className="truncate font-mono text-primary" title={item.value}>{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {snapshot.events.length ? snapshot.events.map((event) => (
          <div key={event.id} className="flex gap-2" data-ide-debug-console-event data-ide-debug-console-level={event.level}>
            <span className="shrink-0 text-subtle">{new Date(event.timestamp).toLocaleTimeString()}</span>
            <span className={cn(
              "shrink-0 uppercase",
              event.level === "error" ? "text-danger" : event.level === "warn" ? "text-warning" : "text-primary",
            )}>{event.level}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words text-ink">{event.text}</span>
          </div>
        )) : (
          <EmptyState
            className="h-full font-sans"
            title="Debug Console 尚无输出"
            description="启动调试会话后，可在下方输入受控表达式（如 session.state、cwd、program、lineNumber）求值。"
            data-ide-debug-console-empty
          />
        )}
      </div>
      <div className="border-t border-line bg-panel px-3 py-2">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 font-mono text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line disabled:opacity-60"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="session.state / cwd / program / lineNumber"
            disabled={!activeSession}
            data-ide-debug-console-input
          />
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => void handleEvaluate("evaluate")} disabled={!canEvaluate} data-ide-debug-console-evaluate>
              {busyMode === "evaluate" ? "求值中" : "求值"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleEvaluate("watch")} disabled={!canEvaluate} data-ide-debug-console-watch>
              {busyMode === "watch" ? "添加中" : "添加监视"}
            </Button>
          </div>
        </div>
        <div className="mt-1 flex min-w-0 justify-between gap-2 text-[11px] text-muted">
          <span className="truncate" data-ide-debug-console-active-session>
            {activeSession ? `当前：${activeSession.name} · ${activeSession.state}` : "先启动一个调试会话"}
          </span>
          {error ? <span className="truncate text-danger" data-ide-debug-console-error>{error}</span> : null}
        </div>
      </div>
    </div>
  );
}
