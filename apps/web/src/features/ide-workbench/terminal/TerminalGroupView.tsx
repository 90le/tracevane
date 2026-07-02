import * as React from "react";

import type { TerminalLayoutNode, TerminalPaneRecord } from "./terminalLayoutTypes";
import { TerminalPaneView } from "./TerminalPaneView";

export function TerminalGroupView({
  node,
  panes,
  rootId,
  cwd,
  activePaneId,
  compact = false,
  onFocusPane,
  onSplitRight,
  onSplitDown,
  onClosePane,
}: {
  node: TerminalLayoutNode;
  panes: Record<string, TerminalPaneRecord>;
  rootId: string;
  cwd: string;
  activePaneId: string;
  compact?: boolean;
  onFocusPane: (paneId: string) => void;
  onSplitRight: (paneId: string) => void;
  onSplitDown: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
}) {
  if (node.type === "pane") {
    const pane = panes[node.paneId];
    if (!pane) return null;
    return (
      <TerminalPaneView
        rootId={rootId}
        cwd={cwd}
        paneId={pane.paneId}
        terminalId={pane.terminalId}
        title={pane.title}
        active={activePaneId === pane.paneId}
        compact={compact}
        onFocus={onFocusPane}
        onSplitRight={onSplitRight}
        onSplitDown={onSplitDown}
        onClose={onClosePane}
      />
    );
  }

  return (
    <div
      className="grid min-h-0 min-w-0 gap-1 bg-panel-3 p-1"
      style={{
        gridTemplateColumns: node.orientation === "horizontal"
          ? node.children.map(() => `minmax(${compact ? 160 : 220}px, 1fr)`).join(" ")
          : undefined,
        gridTemplateRows: node.orientation === "vertical"
          ? node.children.map(() => `minmax(${compact ? 130 : 150}px, 1fr)`).join(" ")
          : undefined,
      }}
      data-ide-terminal-group
      data-terminal-group-id={node.groupId}
      data-terminal-orientation={node.orientation}
    >
      {node.children.map((child, index) => (
        <TerminalGroupView
          key={`${child.type}-${child.type === "pane" ? child.paneId : child.groupId}-${index}`}
          node={child}
          panes={panes}
          rootId={rootId}
          cwd={cwd}
          activePaneId={activePaneId}
          compact={compact}
          onFocusPane={onFocusPane}
          onSplitRight={onSplitRight}
          onSplitDown={onSplitDown}
          onClosePane={onClosePane}
        />
      ))}
    </div>
  );
}
