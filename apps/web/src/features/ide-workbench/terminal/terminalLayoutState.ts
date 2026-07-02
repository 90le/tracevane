import * as React from "react";
import type {
  TerminalLayoutNode,
  TerminalLayoutState,
  TerminalPaneLeaf,
  TerminalPaneRecord,
  TerminalSplitNode,
  TerminalSplitOrientation,
} from "./terminalLayoutTypes";

const STORAGE_PREFIX = "tracevane.ide-workbench.terminal-layout.";
const TERMINAL_LAYOUT_VERSION = 1 as const;

export function useTerminalLayoutState(storageKey: string) {
  const key = `${STORAGE_PREFIX}${storageKey || "default"}`;
  const [layout, setLayout] = React.useState<TerminalLayoutState>(() =>
    loadTerminalLayout(key),
  );

  React.useEffect(() => {
    saveTerminalLayout(key, layout);
  }, [key, layout]);

  const setActivePane = React.useCallback((paneId: string) => {
    setLayout((current) => {
      const pane = current.panes[paneId];
      if (!pane) return current;
      return {
        ...current,
        activePaneId: paneId,
        activeTerminalId: pane.terminalId,
      };
    });
  }, []);

  const newTerminal = React.useCallback(() => {
    setLayout((current) => addPaneToRoot(current, "horizontal"));
  }, []);

  const splitActivePane = React.useCallback((orientation: TerminalSplitOrientation) => {
    setLayout((current) => splitPane(current, current.activePaneId, orientation));
  }, []);

  const splitPaneById = React.useCallback((paneId: string, orientation: TerminalSplitOrientation) => {
    setLayout((current) => splitPane(current, paneId, orientation));
  }, []);

  const closePane = React.useCallback((paneId: string) => {
    setLayout((current) => removePane(current, paneId));
  }, []);

  return {
    layout,
    setActivePane,
    newTerminal,
    splitActivePane,
    splitPaneById,
    closePane,
  };
}

export function createDefaultTerminalLayoutState(): TerminalLayoutState {
  const pane = createPaneRecord(1);
  return {
    version: TERMINAL_LAYOUT_VERSION,
    activePaneId: pane.paneId,
    activeTerminalId: pane.terminalId,
    panes: { [pane.paneId]: pane },
    root: paneLeaf(pane),
  };
}

function createPaneRecord(index: number): TerminalPaneRecord {
  const id = createStableId();
  return {
    paneId: `terminal-pane-${id}`,
    terminalId: `terminal-${id}`,
    title: `Terminal ${index}`,
    createdAt: new Date().toISOString(),
  };
}

function createStableId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function paneLeaf(pane: TerminalPaneRecord): TerminalPaneLeaf {
  return { type: "pane", paneId: pane.paneId, terminalId: pane.terminalId };
}

function splitNode(
  orientation: TerminalSplitOrientation,
  children: TerminalLayoutNode[],
): TerminalSplitNode {
  return {
    type: "split",
    groupId: `terminal-group-${createStableId()}`,
    orientation,
    children,
    sizes: children.map(() => 1 / Math.max(1, children.length)),
  };
}

function nextTerminalIndex(layout: TerminalLayoutState): number {
  return Object.keys(layout.panes).length + 1;
}

function addPaneToRoot(
  layout: TerminalLayoutState,
  orientation: TerminalSplitOrientation,
): TerminalLayoutState {
  const pane = createPaneRecord(nextTerminalIndex(layout));
  const child = paneLeaf(pane);
  const root =
    layout.root.type === "split" && layout.root.orientation === orientation
      ? normalizeSplit({
          ...layout.root,
          children: [...layout.root.children, child],
        })
      : splitNode(orientation, [layout.root, child]);
  return {
    ...layout,
    panes: { ...layout.panes, [pane.paneId]: pane },
    root,
    activePaneId: pane.paneId,
    activeTerminalId: pane.terminalId,
  };
}

function splitPane(
  layout: TerminalLayoutState,
  paneId: string,
  orientation: TerminalSplitOrientation,
): TerminalLayoutState {
  const pane = createPaneRecord(nextTerminalIndex(layout));
  const nextLeaf = paneLeaf(pane);
  let replaced = false;
  const root = replaceNode(layout.root, paneId, (node) => {
    replaced = true;
    return splitNode(orientation, [node, nextLeaf]);
  });
  if (!replaced) return addPaneToRoot(layout, orientation);
  return {
    ...layout,
    panes: { ...layout.panes, [pane.paneId]: pane },
    root,
    activePaneId: pane.paneId,
    activeTerminalId: pane.terminalId,
  };
}

function removePane(layout: TerminalLayoutState, paneId: string): TerminalLayoutState {
  if (!layout.panes[paneId]) return layout;
  const paneIds = Object.keys(layout.panes);
  if (paneIds.length <= 1) return layout;
  const panes = { ...layout.panes };
  delete panes[paneId];
  const root = compactNode(removeNode(layout.root, paneId));
  const fallbackPaneId = layout.activePaneId === paneId
    ? Object.keys(panes)[0]
    : layout.activePaneId;
  const activePane = panes[fallbackPaneId] ?? Object.values(panes)[0];
  return {
    ...layout,
    panes,
    root: root ?? paneLeaf(activePane),
    activePaneId: activePane.paneId,
    activeTerminalId: activePane.terminalId,
  };
}

function replaceNode(
  node: TerminalLayoutNode,
  paneId: string,
  replace: (node: TerminalPaneLeaf) => TerminalLayoutNode,
): TerminalLayoutNode {
  if (node.type === "pane") return node.paneId === paneId ? replace(node) : node;
  return normalizeSplit({
    ...node,
    children: node.children.map((child) => replaceNode(child, paneId, replace)),
  });
}

function removeNode(
  node: TerminalLayoutNode,
  paneId: string,
): TerminalLayoutNode | null {
  if (node.type === "pane") return node.paneId === paneId ? null : node;
  return compactNode({
    ...node,
    children: node.children
      .map((child) => removeNode(child, paneId))
      .filter((child): child is TerminalLayoutNode => Boolean(child)),
  });
}

function compactNode(node: TerminalLayoutNode | null): TerminalLayoutNode | null {
  if (!node) return null;
  if (node.type === "pane") return node;
  if (node.children.length === 0) return null;
  if (node.children.length === 1) return node.children[0];
  return normalizeSplit(node);
}

function normalizeSplit(node: TerminalSplitNode): TerminalSplitNode {
  return {
    ...node,
    children: node.children,
    sizes: node.children.map(() => 1 / Math.max(1, node.children.length)),
  };
}

function loadTerminalLayout(storageKey: string): TerminalLayoutState {
  if (typeof localStorage === "undefined") return createDefaultTerminalLayoutState();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createDefaultTerminalLayoutState();
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return createDefaultTerminalLayoutState();
  }
}

function saveTerminalLayout(storageKey: string, layout: TerminalLayoutState) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Terminal layout metadata persistence must not break the panel.
  }
}

function normalizeLayout(value: unknown): TerminalLayoutState {
  if (!value || typeof value !== "object") return createDefaultTerminalLayoutState();
  const candidate = value as Partial<TerminalLayoutState>;
  if (candidate.version !== TERMINAL_LAYOUT_VERSION) return createDefaultTerminalLayoutState();
  if (!candidate.root || !candidate.panes || typeof candidate.panes !== "object") {
    return createDefaultTerminalLayoutState();
  }
  const root = normalizeNode(candidate.root, candidate.panes);
  if (!root) return createDefaultTerminalLayoutState();
  const activePaneId = candidate.activePaneId && candidate.panes[candidate.activePaneId]
    ? candidate.activePaneId
    : Object.keys(candidate.panes)[0];
  const activePane = candidate.panes[activePaneId];
  return {
    version: TERMINAL_LAYOUT_VERSION,
    panes: candidate.panes,
    root,
    activePaneId: activePane.paneId,
    activeTerminalId: activePane.terminalId,
  };
}

function normalizeNode(
  node: unknown,
  panes: Record<string, TerminalPaneRecord>,
): TerminalLayoutNode | null {
  if (!node || typeof node !== "object") return null;
  const candidate = node as Partial<TerminalLayoutNode>;
  if (candidate.type === "pane") {
    const pane = panes[(candidate as TerminalPaneLeaf).paneId];
    return pane ? paneLeaf(pane) : null;
  }
  if (candidate.type !== "split") return null;
  const split = candidate as TerminalSplitNode;
  const orientation = split.orientation === "vertical" ? "vertical" : "horizontal";
  const children = Array.isArray(split.children)
    ? split.children
        .map((child) => normalizeNode(child, panes))
        .filter((child): child is TerminalLayoutNode => Boolean(child))
    : [];
  return compactNode({
    type: "split",
    groupId: split.groupId || `terminal-group-${createStableId()}`,
    orientation,
    children,
    sizes: children.map(() => 1 / Math.max(1, children.length)),
  });
}
