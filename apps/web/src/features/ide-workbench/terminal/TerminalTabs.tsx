import { PanelTopOpen, Plus, Split, Terminal as TerminalIcon } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import type { TerminalPaneRecord } from "./terminalLayoutTypes";

export function TerminalTabs({
  panes,
  activePaneId,
  onFocusPane,
  onNewTerminal,
  onSplitRight,
  onSplitDown,
}: {
  panes: TerminalPaneRecord[];
  activePaneId: string;
  onFocusPane: (paneId: string) => void;
  onNewTerminal: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center gap-1 border-b border-line bg-panel-2 px-2" data-ide-terminal-tabs>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {panes.map((pane) => (
          <button
            key={pane.paneId}
            type="button"
            onClick={() => onFocusPane(pane.paneId)}
            className={cn(
              "inline-flex min-h-6 max-w-[220px] shrink-0 items-center gap-1.5 rounded-sm border px-2 text-xs outline-none focus-visible:shadow-[var(--ring)]",
              activePaneId === pane.paneId
                ? "border-primary-line bg-primary-soft text-ink-strong"
                : "border-line bg-panel text-muted hover:text-ink",
            )}
            data-ide-terminal-tab
            data-terminal-pane-id={pane.paneId}
            data-active-terminal-tab={activePaneId === pane.paneId ? "true" : "false"}
          >
            <TerminalIcon className="size-3.5" />
            <span className="truncate">{pane.title}</span>
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onNewTerminal} data-ide-terminal-new>
          <Plus />
          New Terminal
        </Button>
        <Button variant="ghost" size="sm" onClick={onSplitRight} data-ide-terminal-split-right>
          <Split />
          Split Right
        </Button>
        <Button variant="ghost" size="sm" onClick={onSplitDown} data-ide-terminal-split-down>
          <PanelTopOpen />
          Split Down
        </Button>
      </div>
    </div>
  );
}
