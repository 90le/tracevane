export type TerminalSplitOrientation = "horizontal" | "vertical";

export interface TerminalPaneLeaf {
  type: "pane";
  paneId: string;
  terminalId: string;
}

export interface TerminalSplitNode {
  type: "split";
  groupId: string;
  orientation: TerminalSplitOrientation;
  children: TerminalLayoutNode[];
  sizes: number[];
}

export type TerminalLayoutNode = TerminalPaneLeaf | TerminalSplitNode;

export interface TerminalPaneRecord {
  paneId: string;
  terminalId: string;
  title: string;
  createdAt: string;
}

export interface TerminalLayoutState {
  version: 1;
  activePaneId: string;
  activeTerminalId: string;
  panes: Record<string, TerminalPaneRecord>;
  root: TerminalLayoutNode;
}

export interface TerminalPanePlacement {
  paneId: string;
  terminalId: string;
  active: boolean;
}
