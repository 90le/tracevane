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
  profileId?: string | null;
  shell?: string | null;
}

export interface TerminalTabRecord {
  tabId: string;
  title: string;
  createdAt: string;
  activePaneId: string;
  activeTerminalId: string;
  panes: Record<string, TerminalPaneRecord>;
  root: TerminalLayoutNode;
}

export interface TerminalLayoutState {
  version: 1;
  activeTabId: string;
  activePaneId: string;
  activeTerminalId: string;
  tabs: TerminalTabRecord[];
}

export interface TerminalPanePlacement {
  paneId: string;
  terminalId: string;
  active: boolean;
}


export interface TerminalProfileSelection {
  profileId?: string | null;
  shell?: string | null;
  label?: string | null;
}
