import * as React from "react";

import { getIdeWorkbenchLayout, putIdeWorkbenchLayout } from "@/lib/api/ideWorkbench";
import type {
  IdeWorkbenchEditorGroup,
  IdeWorkbenchLayoutState,
  WorkbenchActivityId,
  WorkbenchPanelId,
  WorkbenchPanelPlacement,
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
    explorer: {
      directoryPath: "",
    },
    panel: {
      placement: "bottom",
      visible: true,
      collapsed: false,
      size: 220,
      bottomSize: 220,
      rightWidth: 420,
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
  const normalizedWorkspaceKey = workspaceKey || "default";
  const storageKey = `${STORAGE_PREFIX}${normalizedWorkspaceKey}`;
  const hasStoredLayout = React.useMemo(() => hasIdeWorkbenchLayout(storageKey), [storageKey]);
  const [remoteReady, setRemoteReady] = React.useState(hasStoredLayout);
  const [layout, setLayout] = React.useState<IdeWorkbenchLayoutState>(() =>
    loadIdeWorkbenchLayout(storageKey),
  );

  React.useEffect(() => {
    setLayout(loadIdeWorkbenchLayout(storageKey));
    setRemoteReady(hasStoredLayout);
  }, [hasStoredLayout, storageKey]);

  React.useEffect(() => {
    let cancelled = false;
    if (hasStoredLayout) {
      setRemoteReady(true);
      return () => { cancelled = true; };
    }
    const controller = new AbortController();
    getIdeWorkbenchLayout(normalizedWorkspaceKey, controller.signal)
      .then((record) => {
        if (cancelled || !record?.layout) return;
        setLayout(normalizeLayout(record.layout));
      })
      .finally(() => {
        if (!cancelled) setRemoteReady(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasStoredLayout, normalizedWorkspaceKey]);

  React.useEffect(() => {
    saveIdeWorkbenchLayout(storageKey, layout);
    if (!remoteReady) return;
    const timer = window.setTimeout(() => {
      void putIdeWorkbenchLayout(normalizedWorkspaceKey, { layout });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [layout, normalizedWorkspaceKey, remoteReady, storageKey]);

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
    setLayout((current) => {
      const nextSize = clamp(size, current.panel.placement === "right" ? 240 : 140, 10_000);
      return {
        ...current,
        panel: {
          ...current.panel,
          size: nextSize,
          bottomSize: current.panel.placement === "bottom" ? nextSize : current.panel.bottomSize,
          rightWidth: current.panel.placement === "right" ? nextSize : current.panel.rightWidth,
        },
      };
    });
  }, []);

  const setPanelPlacement = React.useCallback((placement: WorkbenchPanelPlacement) => {
    setLayout((current) => {
      const nextSize = placement === "right" ? current.panel.rightWidth : current.panel.bottomSize;
      return {
        ...current,
        panel: {
          ...current.panel,
          placement,
          size: nextSize,
          collapsed: false,
          visible: true,
          maximized: false,
        },
      };
    });
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

  const setExplorerDirectoryPath = React.useCallback((directoryPath: string) => {
    setLayout((current) => {
      const next = {
        ...current,
        explorer: {
          ...current.explorer,
          directoryPath: normalizeLayoutPath(directoryPath),
        },
      };
      saveIdeWorkbenchLayout(storageKey, next);
      void putIdeWorkbenchLayout(normalizedWorkspaceKey, { layout: next });
      return next;
    });
  }, [normalizedWorkspaceKey, storageKey]);

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
    setPanelPlacement,
    togglePanelMaximized,
    setExplorerDirectoryPath,
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

function hasIdeWorkbenchLayout(storageKey: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(storageKey));
  } catch {
    return false;
  }
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
    explorer: normalizeExplorerState(fallback.explorer, candidate.explorer),
    panel: normalizePanelState(fallback.panel, candidate.panel),
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

function normalizePanelState(
  fallback: IdeWorkbenchLayoutState["panel"],
  candidate: Partial<IdeWorkbenchLayoutState>["panel"],
): IdeWorkbenchLayoutState["panel"] {
  const placement = candidate?.placement === "right" ? "right" : "bottom";
  const legacySize = typeof candidate?.size === "number" ? candidate.size : undefined;
  const bottomSize = clamp(
    typeof candidate?.bottomSize === "number" ? candidate.bottomSize : legacySize ?? fallback.bottomSize,
    140,
    2400,
  );
  const rightWidth = clamp(
    typeof candidate?.rightWidth === "number" ? candidate.rightWidth : legacySize ?? fallback.rightWidth,
    240,
    10_000,
  );
  return {
    ...fallback,
    ...candidate,
    placement,
    bottomSize,
    rightWidth,
    size: placement === "right" ? rightWidth : bottomSize,
  };
}

function normalizeExplorerState(
  fallback: IdeWorkbenchLayoutState["explorer"],
  candidate: Partial<IdeWorkbenchLayoutState>["explorer"],
): IdeWorkbenchLayoutState["explorer"] {
  return {
    ...fallback,
    directoryPath: normalizeLayoutPath(candidate?.directoryPath),
  };
}

function normalizeLayoutPath(value: unknown): string {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
