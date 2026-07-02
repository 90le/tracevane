import * as React from "react";

import type {
  IdeWorkbenchEditorGroup,
  IdeWorkbenchLayoutState,
  WorkbenchActivityId,
  WorkbenchPanelId,
} from "./types";
import {
  IDE_DEFAULT_EDITOR_GROUP_ID,
  IDE_WORKBENCH_LAYOUT_VERSION,
} from "./types";

const STORAGE_PREFIX = "tracevane.ide-workbench.layout.";

export function createDefaultIdeWorkbenchLayoutState(): IdeWorkbenchLayoutState {
  return {
    layoutVersion: IDE_WORKBENCH_LAYOUT_VERSION,
    activeActivityId: "explorer",
    sideBar: {
      placement: "left",
      visible: true,
      collapsed: false,
      width: 288,
    },
    secondarySideBar: {
      placement: "right",
      visible: false,
      collapsed: true,
      width: 280,
    },
    panel: {
      placement: "bottom",
      visible: true,
      collapsed: false,
      size: 220,
      maximized: false,
      activePanelId: "terminal",
    },
    viewPlacements: [
      { viewId: "explorer", placement: "primary-sidebar", order: 0, visible: true },
      { viewId: "terminal", placement: "panel", order: 0, visible: true },
      { viewId: "problems", placement: "panel", order: 1, visible: true },
      { viewId: "output", placement: "panel", order: 2, visible: true },
      { viewId: "debugConsole", placement: "panel", order: 3, visible: true },
    ],
    editorGroups: [createEmptyEditorGroup(IDE_DEFAULT_EDITOR_GROUP_ID)],
    activeEditorGroupId: IDE_DEFAULT_EDITOR_GROUP_ID,
    dockviewLayout: null,
  };
}

export function useIdeWorkbenchLayoutState(workspaceKey: string) {
  const storageKey = `${STORAGE_PREFIX}${workspaceKey || "default"}`;
  const [layout, setLayout] = React.useState<IdeWorkbenchLayoutState>(() =>
    loadIdeWorkbenchLayout(storageKey),
  );

  React.useEffect(() => {
    saveIdeWorkbenchLayout(storageKey, layout);
  }, [layout, storageKey]);

  const resetLayout = React.useCallback(() => {
    setLayout(createDefaultIdeWorkbenchLayoutState());
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setLayout((current) => ({
      ...current,
      sideBar: {
        ...current.sideBar,
        collapsed: !current.sideBar.collapsed,
        visible: current.sideBar.collapsed ? true : current.sideBar.visible,
      },
    }));
  }, []);

  const setSidebarWidth = React.useCallback((width: number) => {
    setLayout((current) => ({
      ...current,
      sideBar: {
        ...current.sideBar,
        width: clamp(width, 220, 1600),
      },
    }));
  }, []);

  const togglePanel = React.useCallback(() => {
    setLayout((current) => ({
      ...current,
      panel: {
        ...current.panel,
        collapsed: !current.panel.collapsed,
        maximized: current.panel.collapsed ? current.panel.maximized : false,
        visible: current.panel.collapsed ? true : current.panel.visible,
      },
    }));
  }, []);

  const setPanelSize = React.useCallback((size: number) => {
    setLayout((current) => ({
      ...current,
      panel: {
        ...current.panel,
        size: clamp(size, 140, 2400),
      },
    }));
  }, []);

  const togglePanelMaximized = React.useCallback(() => {
    setLayout((current) => ({
      ...current,
      panel: {
        ...current.panel,
        maximized: !current.panel.maximized,
        collapsed: false,
        visible: true,
      },
    }));
  }, []);

  const setActiveActivityId = React.useCallback((activeActivityId: WorkbenchActivityId) => {
    setLayout((current) => ({
      ...current,
      activeActivityId,
      sideBar: {
        ...current.sideBar,
        collapsed: false,
        visible: true,
      },
    }));
  }, []);

  const setActivePanelId = React.useCallback((activePanelId: WorkbenchPanelId) => {
    setLayout((current) => ({
      ...current,
      panel: {
        ...current.panel,
        activePanelId,
        collapsed: false,
        visible: true,
      },
    }));
  }, []);

  return {
    layout,
    setLayout,
    resetLayout,
    toggleSidebar,
    setSidebarWidth,
    togglePanel,
    setPanelSize,
    togglePanelMaximized,
    setActiveActivityId,
    setActivePanelId,
  };
}

function createEmptyEditorGroup(id: string): IdeWorkbenchEditorGroup {
  return {
    id,
    activeTabId: null,
    tabs: [],
  };
}

function loadIdeWorkbenchLayout(storageKey: string): IdeWorkbenchLayoutState {
  if (typeof localStorage === "undefined") return createDefaultIdeWorkbenchLayoutState();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createDefaultIdeWorkbenchLayoutState();
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return createDefaultIdeWorkbenchLayoutState();
  }
}

function saveIdeWorkbenchLayout(storageKey: string, layout: IdeWorkbenchLayoutState) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Layout persistence failure must not blank the workbench.
  }
}

function normalizeLayout(value: unknown): IdeWorkbenchLayoutState {
  const fallback = createDefaultIdeWorkbenchLayoutState();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<IdeWorkbenchLayoutState>;
  if (candidate.layoutVersion !== IDE_WORKBENCH_LAYOUT_VERSION) return fallback;
  return {
    ...fallback,
    ...candidate,
    sideBar: { ...fallback.sideBar, ...candidate.sideBar },
    secondarySideBar: {
      ...fallback.secondarySideBar,
      ...candidate.secondarySideBar,
    },
    panel: { ...fallback.panel, ...candidate.panel },
    viewPlacements: Array.isArray(candidate.viewPlacements)
      ? candidate.viewPlacements
      : fallback.viewPlacements,
    editorGroups: Array.isArray(candidate.editorGroups) && candidate.editorGroups.length > 0
      ? candidate.editorGroups
      : fallback.editorGroups,
    activeEditorGroupId: candidate.activeEditorGroupId || fallback.activeEditorGroupId,
    dockviewLayout: candidate.dockviewLayout ?? null,
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
