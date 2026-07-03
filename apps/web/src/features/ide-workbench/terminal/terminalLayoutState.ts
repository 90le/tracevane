import * as React from "react";
import type { TerminalSessionDescriptor } from "@/features/cli-agents/types";
import { getIdeWorkbenchLayout, putIdeWorkbenchLayout } from "@/lib/api/ideWorkbench";
import type {
  TerminalLayoutNode,
  TerminalLayoutState,
  TerminalPaneLeaf,
  TerminalPaneRecord,
  TerminalProfileSelection,
  TerminalSplitNode,
  TerminalSplitOrientation,
  TerminalTabRecord,
} from "./terminalLayoutTypes";

const STORAGE_PREFIX = "tracevane.ide-workbench.terminal-layout.";
const TERMINAL_LAYOUT_VERSION = 1 as const;

export function useTerminalLayoutState(storageKey: string, workspaceKey = "default") {
  const terminalLayoutKey = storageKey || "default";
  const key = `${STORAGE_PREFIX}${terminalLayoutKey}`;
  const normalizedWorkspaceKey = workspaceKey || "default";
  const [layoutState, setLayoutState] = React.useState<{ key: string; layout: TerminalLayoutState }>(() => ({
    key,
    layout: loadTerminalLayout(key),
  }));
  const { layout } = layoutState;
  const setLayout = React.useCallback((updater: TerminalLayoutState | ((current: TerminalLayoutState) => TerminalLayoutState)) => {
    userEditedRef.current = true;
    setLayoutState((current) => ({
      ...current,
      layout: typeof updater === "function"
        ? (updater as (current: TerminalLayoutState) => TerminalLayoutState)(current.layout)
        : updater,
    }));
  }, []);
  const hasStoredLayout = React.useMemo(() => hasTerminalLayout(key), [key]);
  const [remoteReady, setRemoteReady] = React.useState(hasStoredLayout);
  const remoteLayoutFoundRef = React.useRef(false);
  const userEditedRef = React.useRef(false);

  React.useEffect(() => {
    remoteLayoutFoundRef.current = false;
    userEditedRef.current = false;
    setLayoutState({ key, layout: loadTerminalLayout(key) });
    setRemoteReady(hasStoredLayout);
  }, [hasStoredLayout, key]);

  React.useEffect(() => {
    let cancelled = false;
    if (hasStoredLayout) {
      setRemoteReady(true);
      return () => { cancelled = true; };
    }
    const controller = new AbortController();
    getIdeWorkbenchLayout(normalizedWorkspaceKey, controller.signal)
      .then((record) => {
        if (cancelled) return;
        const remoteLayout = record?.terminalLayouts?.[terminalLayoutKey];
        if (remoteLayout) {
          remoteLayoutFoundRef.current = true;
          if (!userEditedRef.current) {
            setLayoutState({ key, layout: normalizeLayout(remoteLayout) });
          }
        }
      })
      .finally(() => {
        if (!cancelled) setRemoteReady(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasStoredLayout, normalizedWorkspaceKey, terminalLayoutKey]);

  React.useEffect(() => {
    if (layoutState.key !== key) return;
    saveTerminalLayout(key, layout);
    if (!remoteReady) return;
    const timer = window.setTimeout(() => {
      void putIdeWorkbenchLayout(normalizedWorkspaceKey, {
        terminalLayouts: { [terminalLayoutKey]: layout },
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [key, layout, layoutState.key, normalizedWorkspaceKey, remoteReady, terminalLayoutKey]);

  const setActiveTab = React.useCallback((tabId: string) => {
    setLayout((current) => activateTab(current, tabId));
  }, []);

  const setActivePane = React.useCallback((paneId: string) => {
    setLayout((current) => updateActiveTab(current, (tab) => activatePane(tab, paneId)));
  }, []);

  const newTerminal = React.useCallback((profile?: TerminalProfileSelection) => {
    setLayout((current) => addTerminalTab(current, profile));
  }, []);

  const splitActivePane = React.useCallback((orientation: TerminalSplitOrientation) => {
    setLayout((current) => updateActiveTab(current, (tab) => splitPane(tab, tab.activePaneId, orientation)));
  }, []);

  const splitPaneById = React.useCallback((paneId: string, orientation: TerminalSplitOrientation) => {
    setLayout((current) => updateActiveTab(current, (tab) => splitPane(tab, paneId, orientation)));
  }, []);

  const splitTabById = React.useCallback((tabId: string, orientation: TerminalSplitOrientation) => {
    setLayout((current) => updateTabById(current, tabId, (tab) => splitPane(tab, tab.activePaneId, orientation), true));
  }, []);

  const closePane = React.useCallback((paneId: string) => {
    setLayout((current) => closePaneInActiveTab(current, paneId));
  }, []);

  const closeTab = React.useCallback((tabId: string) => {
    setLayout((current) => closeTabById(current, tabId));
  }, []);

  const closeOtherTabs = React.useCallback((tabId: string) => {
    setLayout((current) => closeTabsExcept(current, tabId));
  }, []);

  const closeTabsToRight = React.useCallback((tabId: string) => {
    setLayout((current) => closeTabsRightOf(current, tabId));
  }, []);

  const reorderTab = React.useCallback((tabId: string, targetTabId: string, placement: "before" | "after" = "before") => {
    setLayout((current) => reorderTabAround(current, tabId, targetTabId, placement));
  }, []);

  const moveTab = React.useCallback((tabId: string, direction: -1 | 1) => {
    setLayout((current) => moveTabByOffset(current, tabId, direction));
  }, []);

  const hydrateRecoverableSessions = React.useCallback((sessions: TerminalSessionDescriptor[]) => {
    if (hasStoredLayout || !remoteReady || remoteLayoutFoundRef.current) return;
    setLayout((current) => {
      if (current.tabs.length > 1 || current.tabs.some((tab) => Object.keys(tab.panes).length > 1)) {
        return current;
      }
      const hydrated = createLayoutFromSessionDescriptors(sessions);
      return hydrated ?? current;
    });
  }, [hasStoredLayout, remoteReady]);

  const attachSessionDescriptor = React.useCallback((session: TerminalSessionDescriptor) => {
    setLayout((current) => attachSessionDescriptorToLayout(current, session));
  }, []);

  const resizeSplit = React.useCallback((groupId: string, childIndex: number, deltaPx: number, totalPx: number) => {
    setLayout((current) => updateActiveTab(current, (tab) => ({
      ...tab,
      root: resizeSplitNode(tab.root, groupId, childIndex, deltaPx, totalPx),
    })));
  }, []);

  return {
    layout,
    setActiveTab,
    setActivePane,
    newTerminal,
    splitActivePane,
    splitPaneById,
    splitTabById,
    closePane,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    reorderTab,
    moveTab,
    resizeSplit,
    hydrateRecoverableSessions,
    attachSessionDescriptor,
  };
}

export function createDefaultTerminalLayoutState(): TerminalLayoutState {
  const tab = createTerminalTabRecord(1);
  return stateFromTabs([tab], tab.tabId);
}

function createTerminalTabRecord(index: number, profile?: TerminalProfileSelection): TerminalTabRecord {
  const pane = createPaneRecord(index, 1, profile);
  return {
    tabId: `terminal-tab-${createStableId()}`,
    title: paneIndexTitle(index, profile, false),
    createdAt: pane.createdAt,
    activePaneId: pane.paneId,
    activeTerminalId: pane.terminalId,
    panes: { [pane.paneId]: pane },
    root: paneLeaf(pane),
  };
}

function createPaneRecord(tabIndex: number, paneIndex: number, profile?: TerminalProfileSelection): TerminalPaneRecord {
  const id = createStableId();
  const title = paneIndex === 1
    ? paneIndexTitle(tabIndex, profile, true)
    : `${paneIndexTitle(tabIndex, profile, true)}.${paneIndex}`;
  return {
    paneId: `terminal-pane-${id}`,
    terminalId: `terminal-${id}`,
    title,
    createdAt: new Date().toISOString(),
    profileId: normalizeProfileId(profile?.profileId),
    shell: normalizeShell(profile?.shell),
  };
}

function paneIndexTitle(index: number, profile: TerminalProfileSelection | undefined, includeIndex: boolean): string {
  const label = normalizeProfileLabel(profile);
  if (!includeIndex) return index === 1 ? label : `${label} ${index}`;
  return index === 1 && label === "Terminal" ? "Terminal" : (index === 1 ? label : `${label} ${index}`);
}

function normalizeProfileLabel(profile: TerminalProfileSelection | undefined): string {
  const label = String(profile?.label || "").trim();
  if (label) return label;
  const inheritedTitle = String((profile as { title?: string } | undefined)?.title || "").trim();
  const inheritedLabel = inheritedTitle.replace(/(?:\s+|\.)\d+$/, "");
  if (inheritedLabel && inheritedLabel !== "Terminal") return inheritedLabel;
  const shell = normalizeShell(profile?.shell);
  if (!shell || shell === "bash") return "Terminal";
  const labels: Record<string, string> = { sh: "Sh", zsh: "Zsh", fish: "Fish", pwsh: "PowerShell", powershell: "PowerShell", cmd: "Cmd" };
  return labels[shell] || shell;
}

function normalizeProfileId(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  return raw || "local-shell";
}

function normalizeShell(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  return raw || "bash";
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
  return normalizeSplit({
    type: "split",
    groupId: `terminal-group-${createStableId()}`,
    orientation,
    children,
    sizes: children.map(() => 1 / Math.max(1, children.length)),
  });
}

function stateFromTabs(tabs: TerminalTabRecord[], activeTabId: string): TerminalLayoutState {
  const activeTab = tabs.find((tab) => tab.tabId === activeTabId) ?? tabs[0] ?? createTerminalTabRecord(1);
  const nextTabs = tabs.length ? tabs : [activeTab];
  return {
    version: TERMINAL_LAYOUT_VERSION,
    tabs: nextTabs,
    activeTabId: activeTab.tabId,
    activePaneId: activeTab.activePaneId,
    activeTerminalId: activeTab.activeTerminalId,
  };
}

function nextTerminalIndex(layout: TerminalLayoutState): number {
  return layout.tabs.length + 1;
}

function nextPaneIndex(tab: TerminalTabRecord): number {
  return Object.keys(tab.panes).length + 1;
}

function addTerminalTab(layout: TerminalLayoutState, profile?: TerminalProfileSelection): TerminalLayoutState {
  const tab = createTerminalTabRecord(nextTerminalIndex(layout), profile);
  return stateFromTabs([...layout.tabs, tab], tab.tabId);
}

function activateTab(layout: TerminalLayoutState, tabId: string): TerminalLayoutState {
  return stateFromTabs(layout.tabs, tabId);
}

function activatePane(tab: TerminalTabRecord, paneId: string): TerminalTabRecord {
  const pane = tab.panes[paneId];
  if (!pane) return tab;
  return {
    ...tab,
    activePaneId: pane.paneId,
    activeTerminalId: pane.terminalId,
  };
}

function updateActiveTab(
  layout: TerminalLayoutState,
  update: (tab: TerminalTabRecord) => TerminalTabRecord,
): TerminalLayoutState {
  const activeTab = layout.tabs.find((tab) => tab.tabId === layout.activeTabId) ?? layout.tabs[0];
  if (!activeTab) return createDefaultTerminalLayoutState();
  return updateTabById(layout, activeTab.tabId, update, true);
}

function updateTabById(
  layout: TerminalLayoutState,
  tabId: string,
  update: (tab: TerminalTabRecord) => TerminalTabRecord,
  activate: boolean,
): TerminalLayoutState {
  const targetTab = layout.tabs.find((tab) => tab.tabId === tabId);
  if (!targetTab) return layout;
  const nextTab = update(targetTab);
  const tabs = layout.tabs.map((tab) => (tab.tabId === targetTab.tabId ? nextTab : tab));
  return stateFromTabs(tabs, activate ? nextTab.tabId : layout.activeTabId);
}

function splitPane(
  tab: TerminalTabRecord,
  paneId: string,
  orientation: TerminalSplitOrientation,
): TerminalTabRecord {
  const sourcePane = tab.panes[paneId];
  const pane = createPaneRecord(extractTabIndex(tab.title), nextPaneIndex(tab), sourcePane);
  const nextLeaf = paneLeaf(pane);
  let replaced = false;
  const root = replaceNode(tab.root, paneId, (node) => {
    replaced = true;
    return splitNode(orientation, [node, nextLeaf]);
  });
  const nextTab = {
    ...tab,
    panes: { ...tab.panes, [pane.paneId]: pane },
    root: replaced ? root : splitNode(orientation, [tab.root, nextLeaf]),
  };
  return activatePane(nextTab, pane.paneId);
}

function closeTabById(layout: TerminalLayoutState, tabId: string): TerminalLayoutState {
  const targetIndex = layout.tabs.findIndex((tab) => tab.tabId === tabId);
  if (targetIndex < 0) return layout;
  const tabs = layout.tabs.filter((tab) => tab.tabId !== tabId);
  if (!tabs.length) return createDefaultTerminalLayoutState();
  const fallback = tabs[Math.max(0, targetIndex - 1)] ?? tabs.at(-1)!;
  return stateFromTabs(tabs, layout.activeTabId === tabId ? fallback.tabId : layout.activeTabId);
}

function closeTabsExcept(layout: TerminalLayoutState, tabId: string): TerminalLayoutState {
  const target = layout.tabs.find((tab) => tab.tabId === tabId);
  return target ? stateFromTabs([target], target.tabId) : layout;
}

function closeTabsRightOf(layout: TerminalLayoutState, tabId: string): TerminalLayoutState {
  const targetIndex = layout.tabs.findIndex((tab) => tab.tabId === tabId);
  if (targetIndex < 0) return layout;
  const tabs = layout.tabs.slice(0, targetIndex + 1);
  return stateFromTabs(tabs, layout.activeTabId);
}

function reorderTabAround(
  layout: TerminalLayoutState,
  tabId: string,
  targetTabId: string,
  placement: "before" | "after",
): TerminalLayoutState {
  if (tabId === targetTabId) return layout;
  const source = layout.tabs.find((tab) => tab.tabId === tabId);
  if (!source) return layout;
  const withoutSource = layout.tabs.filter((tab) => tab.tabId !== tabId);
  const targetIndex = withoutSource.findIndex((tab) => tab.tabId === targetTabId);
  if (targetIndex < 0) return layout;
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  const tabs = [...withoutSource.slice(0, insertIndex), source, ...withoutSource.slice(insertIndex)];
  return stateFromTabs(tabs, layout.activeTabId);
}

function moveTabByOffset(layout: TerminalLayoutState, tabId: string, direction: -1 | 1): TerminalLayoutState {
  const index = layout.tabs.findIndex((tab) => tab.tabId === tabId);
  if (index < 0) return layout;
  const nextIndex = Math.max(0, Math.min(layout.tabs.length - 1, index + direction));
  if (nextIndex === index) return layout;
  const tabs = [...layout.tabs];
  const [tab] = tabs.splice(index, 1);
  tabs.splice(nextIndex, 0, tab);
  return stateFromTabs(tabs, layout.activeTabId);
}

function closePaneInActiveTab(layout: TerminalLayoutState, paneId: string): TerminalLayoutState {
  const activeTab = layout.tabs.find((tab) => tab.tabId === layout.activeTabId) ?? layout.tabs[0];
  if (!activeTab) return createDefaultTerminalLayoutState();
  if (!activeTab.panes[paneId]) return layout;

  const paneIds = Object.keys(activeTab.panes);
  if (paneIds.length <= 1) {
    const tabs = layout.tabs.filter((tab) => tab.tabId !== activeTab.tabId);
    if (!tabs.length) return createDefaultTerminalLayoutState();
    const fallback = tabs[Math.max(0, layout.tabs.findIndex((tab) => tab.tabId === activeTab.tabId) - 1)] ?? tabs.at(-1)!;
    return stateFromTabs(tabs, fallback.tabId);
  }

  const panes = { ...activeTab.panes };
  delete panes[paneId];
  const root = compactNode(removeNode(activeTab.root, paneId));
  const fallbackPaneId = activeTab.activePaneId === paneId
    ? Object.keys(panes)[0]
    : activeTab.activePaneId;
  const activePane = panes[fallbackPaneId] ?? Object.values(panes)[0];
  const nextTab: TerminalTabRecord = {
    ...activeTab,
    panes,
    root: root ?? paneLeaf(activePane),
    activePaneId: activePane.paneId,
    activeTerminalId: activePane.terminalId,
  };
  return stateFromTabs(layout.tabs.map((tab) => (tab.tabId === activeTab.tabId ? nextTab : tab)), nextTab.tabId);
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
  const children = node.children;
  const existing = Array.isArray(node.sizes) && node.sizes.length === children.length
    ? node.sizes.map((size) => Math.max(0.05, Number(size) || 0))
    : children.map(() => 1 / Math.max(1, children.length));
  const total = existing.reduce((sum, size) => sum + size, 0) || 1;
  return {
    ...node,
    children,
    sizes: existing.map((size) => size / total),
  };
}

function resizeSplitNode(
  node: TerminalLayoutNode,
  groupId: string,
  childIndex: number,
  deltaPx: number,
  totalPx: number,
): TerminalLayoutNode {
  if (node.type === "pane") return node;
  if (node.groupId !== groupId) {
    return normalizeSplit({
      ...node,
      children: node.children.map((child) => resizeSplitNode(child, groupId, childIndex, deltaPx, totalPx)),
    });
  }
  if (childIndex < 0 || childIndex >= node.children.length - 1) return node;
  const delta = totalPx > 0 ? deltaPx / totalPx : 0;
  const sizes = [...node.sizes];
  const min = Math.min(0.25, 1 / Math.max(4, sizes.length * 3));
  const left = Math.max(min, sizes[childIndex] + delta);
  const right = Math.max(min, sizes[childIndex + 1] - delta);
  const pairTotal = sizes[childIndex] + sizes[childIndex + 1];
  const scale = pairTotal / (left + right);
  sizes[childIndex] = left * scale;
  sizes[childIndex + 1] = right * scale;
  return normalizeSplit({ ...node, sizes });
}

function hasTerminalLayout(storageKey: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(storageKey));
  } catch {
    return false;
  }
}

function attachSessionDescriptorToLayout(
  layout: TerminalLayoutState,
  session: TerminalSessionDescriptor,
): TerminalLayoutState {
  const terminalId = normalizeHydratedId(session.sessionId);
  if (!terminalId) return layout;
  const existing = layout.tabs.find((tab) => Object.values(tab.panes).some((pane) => pane.terminalId === terminalId));
  if (existing) return stateFromTabs(layout.tabs, existing.tabId);
  const tab = createTerminalTabFromDescriptor(session, layout.tabs.length + 1);
  return stateFromTabs([...layout.tabs, tab], tab.tabId);
}

function createLayoutFromSessionDescriptors(
  sessions: TerminalSessionDescriptor[],
): TerminalLayoutState | null {
  const recoverable = sessions
    .filter((session) => session.pinned && session.canResume && (session.status === "running" || session.status === "detached"))
    .sort((left, right) => String(left.createdAt || left.updatedAt).localeCompare(String(right.createdAt || right.updatedAt)))
    .slice(0, 12);
  if (!recoverable.length) return null;
  const tabs = recoverable.map((session, index) => createTerminalTabFromDescriptor(session, index + 1));
  return stateFromTabs(tabs, tabs.at(-1)?.tabId ?? tabs[0].tabId);
}

function createTerminalTabFromDescriptor(
  session: TerminalSessionDescriptor,
  index: number,
): TerminalTabRecord {
  const terminalId = normalizeHydratedId(session.sessionId) || `terminal-${createStableId()}`;
  const paneId = `terminal-pane-${terminalId}`;
  const pane: TerminalPaneRecord = {
    paneId,
    terminalId,
    title: String(session.title || titleFromSession(session, index)),
    createdAt: String(session.createdAt || session.updatedAt || new Date().toISOString()),
    profileId: session.profileId ?? null,
    shell: session.shell ?? null,
  };
  return {
    tabId: `terminal-tab-${terminalId}`,
    title: pane.title,
    createdAt: pane.createdAt,
    activePaneId: paneId,
    activeTerminalId: terminalId,
    panes: { [paneId]: pane },
    root: paneLeaf(pane),
  };
}

function titleFromSession(session: TerminalSessionDescriptor, index: number): string {
  const shell = normalizeShell(session.shell);
  const profileLabel = shell && shell !== "bash" ? normalizeProfileLabel({ shell }) : "Terminal";
  return index === 1 ? profileLabel : `${profileLabel} ${index}`;
}

function normalizeHydratedId(value: unknown): string {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 120);
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
  const candidate = value as Partial<TerminalLayoutState> & {
    panes?: Record<string, TerminalPaneRecord>;
    root?: TerminalLayoutNode;
  };
  if (candidate.version !== TERMINAL_LAYOUT_VERSION) return createDefaultTerminalLayoutState();

  if (Array.isArray(candidate.tabs) && candidate.tabs.length) {
    const tabs = candidate.tabs
      .map((tab, index) => normalizeTab(tab, index + 1))
      .filter((tab): tab is TerminalTabRecord => Boolean(tab));
    if (!tabs.length) return createDefaultTerminalLayoutState();
    return stateFromTabs(tabs, candidate.activeTabId || tabs[0].tabId);
  }

  // Backward compatibility for the old M5.x-A shape: one root split with all
  // panes. Treat it as one terminal tab rather than keeping New Terminal as a
  // forced split forever.
  if (candidate.root && candidate.panes && typeof candidate.panes === "object") {
    const tab = normalizeTab({
      tabId: "terminal-tab-migrated",
      title: "Terminal",
      createdAt: new Date().toISOString(),
      activePaneId: candidate.activePaneId,
      activeTerminalId: candidate.activeTerminalId,
      panes: candidate.panes,
      root: candidate.root,
    }, 1);
    if (tab) return stateFromTabs([tab], tab.tabId);
  }

  return createDefaultTerminalLayoutState();
}

function normalizeTab(value: unknown, index: number): TerminalTabRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TerminalTabRecord>;
  if (!candidate.root || !candidate.panes || typeof candidate.panes !== "object") return null;
  const panes = normalizePanes(candidate.panes);
  const root = normalizeNode(candidate.root, panes);
  if (!root || Object.keys(panes).length === 0) return null;
  const activePaneId = candidate.activePaneId && panes[candidate.activePaneId]
    ? candidate.activePaneId
    : Object.keys(panes)[0];
  const activePane = panes[activePaneId];
  return {
    tabId: String(candidate.tabId || `terminal-tab-${createStableId()}`),
    title: String(candidate.title || (index === 1 ? "Terminal" : `Terminal ${index}`)),
    createdAt: String(candidate.createdAt || activePane.createdAt || new Date().toISOString()),
    panes,
    root,
    activePaneId: activePane.paneId,
    activeTerminalId: activePane.terminalId,
  };
}

function normalizePanes(value: Record<string, TerminalPaneRecord>): Record<string, TerminalPaneRecord> {
  const output: Record<string, TerminalPaneRecord> = {};
  for (const [key, pane] of Object.entries(value)) {
    if (!pane || typeof pane !== "object") continue;
    const paneId = String(pane.paneId || key || "").trim();
    const terminalId = String(pane.terminalId || "").trim();
    if (!paneId || !terminalId) continue;
    output[paneId] = {
      paneId,
      terminalId,
      title: String(pane.title || "Terminal"),
      createdAt: String(pane.createdAt || new Date().toISOString()),
      profileId: pane.profileId ?? null,
      shell: pane.shell ?? null,
    };
  }
  return output;
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
    sizes: Array.isArray(split.sizes) ? split.sizes : [],
  });
}

function extractTabIndex(title: string): number {
  const match = /Terminal\s+(\d+)/i.exec(title);
  return match ? Number(match[1]) || 1 : 1;
}
