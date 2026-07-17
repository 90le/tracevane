import * as React from "react";
import { Eraser, Lock, LockOpen, ScrollText } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { PanelHeader, PanelHeaderChip } from "../panelHeader";
import { clearWorkbenchOutput, type WorkbenchOutputLevel, useWorkbenchOutput } from "./outputStore";

export function IdeOutputPanel() {
  const snapshot = useWorkbenchOutput();
  const [activeChannelId, setActiveChannelId] = React.useState("system");
  const [scrollLock, setScrollLock] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const activeChannel = snapshot.channels.find((channel) => channel.id === activeChannelId) ?? snapshot.channels[0];
  const activeEvents = snapshot.events.filter((event) => event.channelId === activeChannel?.id);

  React.useEffect(() => {
    if (!activeChannel && snapshot.channels[0]) setActiveChannelId(snapshot.channels[0].id);
  }, [activeChannel, snapshot.channels]);

  React.useEffect(() => {
    if (scrollLock) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [activeEvents.length, activeChannelId, scrollLock]);

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-panel text-sm" data-ide-output-panel>
      <PanelHeader
        title="输出"
        icon={<ScrollText />}
        actions={(
          <>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 min-h-0 px-2 text-xs", scrollLock && "text-primary")}
              onClick={() => setScrollLock((value) => !value)}
              aria-pressed={scrollLock}
              data-ide-output-scroll-lock
            >
              {scrollLock ? <Lock /> : <LockOpen />}
              {scrollLock ? "已锁定" : "自动滚动"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 min-h-0 px-2 text-xs" onClick={() => clearWorkbenchOutput(activeChannel?.id)} disabled={!activeEvents.length} data-ide-output-clear>
              <Eraser />
              清空
            </Button>
          </>
        )}
      >
        <select
          id="ide-output-channel"
          aria-label="输出通道"
          className="h-7 min-w-32 max-w-48 truncate rounded-sm border border-line bg-canvas px-2 text-xs text-ink outline-none focus-visible:shadow-[var(--ring)]"
          value={activeChannel?.id ?? "system"}
          onChange={(event) => setActiveChannelId(event.target.value)}
          data-ide-output-channel-select
        >
          {snapshot.channels.map((channel) => (
            <option key={channel.id} value={channel.id}>{channel.label}</option>
          ))}
        </select>
        <PanelHeaderChip data-ide-output-event-count>{activeEvents.length}</PanelHeaderChip>
      </PanelHeader>
      <div ref={viewportRef} className="min-h-0 overflow-auto bg-canvas px-3 py-1 font-mono text-xs" data-ide-output-events>
        {activeEvents.length ? activeEvents.map((event) => (
          <div key={event.sequence} className="grid grid-cols-[74px_52px_minmax(0,1fr)] gap-2 border-b border-line/50 py-1 last:border-b-0" data-ide-output-event data-ide-output-level={event.level}>
            <span className="tabular-nums text-subtle">{formatOutputTime(event.timestamp)}</span>
            <span className={cn("font-sans text-2xs font-semibold uppercase leading-4 tracking-wide", levelClassName(event.level))}>{event.level}</span>
            <span className="whitespace-pre-wrap break-words text-ink">{event.text}</span>
          </div>
        )) : (
          <EmptyState
            className="h-full min-h-40 font-sans"
            icon={<ScrollText />}
            title="当前通道没有日志"
            description="运行任务、语言服务、Git 或调试操作后，对应通道的输出会显示在这里。"
            data-ide-output-empty
          />
        )}
      </div>
    </section>
  );
}

function levelClassName(level: WorkbenchOutputLevel) {
  if (level === "error") return "text-danger";
  if (level === "warn") return "text-warning";
  if (level === "debug") return "text-subtle";
  return "text-primary";
}

function formatOutputTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
