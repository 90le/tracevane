import * as React from "react";

import type { TerminalLayoutNode, TerminalPaneRecord } from "./terminalLayoutTypes";
import { TerminalPaneView } from "./TerminalPaneView";

export function TerminalGroupView({
  node,
  panes,
  rootId,
  cwd,
  cwdAbsolutePath,
  activePaneId,
  showPaneHeader = true,
  onFocusPane,
  onClosePane,
  onResizeSplit,
}: {
  node: TerminalLayoutNode;
  panes: Record<string, TerminalPaneRecord>;
  rootId: string;
  cwd: string;
  cwdAbsolutePath?: string;
  activePaneId: string;
  showPaneHeader?: boolean;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onResizeSplit: (groupId: string, childIndex: number, deltaPx: number, totalPx: number) => void;
}) {
  if (node.type === "pane") {
    const pane = panes[node.paneId];
    if (!pane) return null;
    return (
      <TerminalPaneView
        key={pane.terminalId}
        rootId={rootId}
        cwd={cwd}
        cwdAbsolutePath={cwdAbsolutePath}
        paneId={pane.paneId}
        terminalId={pane.terminalId}
        title={pane.title}
        profileId={pane.profileId}
        shell={pane.shell}
        createMode={pane.createMode}
        active={activePaneId === pane.paneId}
        showHeader={showPaneHeader}
        onFocus={onFocusPane}
        onClose={onClosePane}
      />
    );
  }

  const isHorizontal = node.orientation === "horizontal";
  const sizes = node.sizes.length === node.children.length
    ? node.sizes
    : node.children.map(() => 1 / Math.max(1, node.children.length));

  return (
    <div
      className={isHorizontal
        ? "flex h-full min-h-0 min-w-0 bg-panel-3 p-1"
        : "flex h-full min-h-0 min-w-0 flex-col bg-panel-3 p-1"}
      data-ide-terminal-group
      data-terminal-group-id={node.groupId}
      data-terminal-orientation={node.orientation}
    >
      {node.children.map((child, index) => (
        <React.Fragment key={`${child.type}-${child.type === "pane" ? child.paneId : child.groupId}-${index}`}>
          <div
            className="min-h-0 min-w-0"
            style={{
              flexGrow: sizes[index] ?? 1,
              flexShrink: 1,
              flexBasis: 0,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <TerminalGroupView
              node={child}
              panes={panes}
              rootId={rootId}
              cwd={cwd}
              cwdAbsolutePath={cwdAbsolutePath}
              activePaneId={activePaneId}
              showPaneHeader={showPaneHeader}
              onFocusPane={onFocusPane}
              onClosePane={onClosePane}
              onResizeSplit={onResizeSplit}
            />
          </div>
          {index < node.children.length - 1 ? (
            <TerminalSplitResizeHandle
              orientation={node.orientation}
              groupId={node.groupId}
              childIndex={index}
              onResize={onResizeSplit}
            />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function TerminalSplitResizeHandle({
  orientation,
  groupId,
  childIndex,
  onResize,
}: {
  orientation: "horizontal" | "vertical";
  groupId: string;
  childIndex: number;
  onResize: (groupId: string, childIndex: number, deltaPx: number, totalPx: number) => void;
}) {
  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const container = event.currentTarget.parentElement;
    const totalPx = orientation === "horizontal"
      ? container?.clientWidth ?? 0
      : container?.clientHeight ?? 0;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaPx = orientation === "horizontal"
        ? moveEvent.clientX - startX
        : moveEvent.clientY - startY;
      onResize(groupId, childIndex, deltaPx, totalPx);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [childIndex, groupId, onResize, orientation]);

  return (
    <div
      role="separator"
      aria-label={orientation === "horizontal" ? "调整终端拆分宽度" : "调整终端拆分高度"}
      aria-orientation={orientation === "horizontal" ? "vertical" : "horizontal"}
      tabIndex={0}
      className={orientation === "horizontal"
        ? "mx-0.5 w-1.5 shrink-0 cursor-col-resize rounded bg-transparent outline-none transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"
        : "my-0.5 h-1.5 shrink-0 cursor-row-resize rounded bg-transparent outline-none transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"}
      onPointerDown={handlePointerDown}
      data-ide-terminal-split-resize-handle
      data-terminal-group-id={groupId}
      data-terminal-split-index={childIndex}
    />
  );
}
