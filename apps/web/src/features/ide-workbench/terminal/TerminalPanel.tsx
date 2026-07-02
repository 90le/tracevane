import * as React from "react";
import { Terminal as TerminalIcon } from "lucide-react";

import { useTerminalLayoutState } from "./terminalLayoutState";
import { TerminalGroupView } from "./TerminalGroupView";
import { TerminalTabs } from "./TerminalTabs";

export function TerminalPanel({
  rootId,
  cwd,
  active,
}: {
  rootId: string;
  cwd: string;
  active: boolean;
}) {
  const layoutApi = useTerminalLayoutState(`${rootId || "pending-root"}:${cwd || "root"}`);
  const { layout } = layoutApi;
  const paneList = React.useMemo(
    () => Object.values(layout.panes).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [layout.panes],
  );

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-panel text-ink" data-ide-terminal-panel>
      <TerminalTabs
        panes={paneList}
        activePaneId={layout.activePaneId}
        onFocusPane={layoutApi.setActivePane}
        onNewTerminal={layoutApi.newTerminal}
        onSplitRight={() => layoutApi.splitActivePane("horizontal")}
        onSplitDown={() => layoutApi.splitActivePane("vertical")}
      />
      <div className="flex min-h-8 items-center gap-2 border-b border-line bg-panel px-2 text-xs text-muted" data-ide-terminal-status>
        <TerminalIcon className="size-3.5 text-primary" />
        <span className="truncate">cwd: /{cwd || ""}</span>
        <span className="ml-auto truncate">
          {paneList.length} pane{paneList.length > 1 ? "s" : ""} · active {layout.activeTerminalId}
        </span>
      </div>
      <div className="min-h-0 min-w-0" data-ide-terminal-layout data-terminal-pane-count={paneList.length} data-terminal-active-pane-id={layout.activePaneId}>
        {active ? (
          <TerminalGroupView
            node={layout.root}
            panes={layout.panes}
            rootId={rootId}
            cwd={cwd}
            activePaneId={layout.activePaneId}
            onFocusPane={layoutApi.setActivePane}
            onSplitRight={(paneId) => layoutApi.splitPaneById(paneId, "horizontal")}
            onSplitDown={(paneId) => layoutApi.splitPaneById(paneId, "vertical")}
            onClosePane={layoutApi.closePane}
          />
        ) : null}
      </div>
    </div>
  );
}
