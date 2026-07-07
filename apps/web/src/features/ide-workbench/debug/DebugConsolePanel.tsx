import * as React from "react";

import { cn } from "@/design/lib/utils";
import { useIdeDebugSnapshot } from "./debugStore";

export function DebugConsolePanel() {
  const snapshot = useIdeDebugSnapshot();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [snapshot.events.length]);

  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-canvas" data-ide-debug-console-panel>
      <div className="flex min-h-8 items-center justify-between border-b border-line px-3 text-xs text-muted">
        <span>Debug Console</span>
        <span>{snapshot.sessions.length} sessions · {snapshot.events.length} events</span>
      </div>
      <div ref={scrollerRef} className="min-h-0 overflow-auto p-3 font-mono text-xs leading-5">
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
          <div className="rounded-md border border-dashed border-line bg-panel p-3 text-sm font-sans text-muted" data-ide-debug-console-empty>
            Debug Console 尚无输出。启动 mock debug session 后会显示 Gateway 输出事件。
          </div>
        )}
      </div>
    </div>
  );
}
