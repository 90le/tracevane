import * as React from "react";
import type { TerminalProfileDescriptor } from "@/features/cli-agents/types";
import { getTerminalProfiles } from "@/lib/api/terminal";
import { toast } from "@/design/ui/sonner";
import { endWorkbenchTerminalSession, schedulePendingTerminalKillFlush } from "./terminalClient";
import { useTerminalLayoutState } from "./terminalLayoutState";
import { TerminalGroupView } from "./TerminalGroupView";
import { TerminalTabs } from "./TerminalTabs";

export function TerminalPanel({
  rootId,
  cwd,
  active,
  placement = "bottom",
  rootAbsolutePath,
}: {
  rootId: string;
  cwd: string;
  active: boolean;
  placement?: "bottom" | "right";
  rootAbsolutePath?: string;
}) {
  const layoutApi = useTerminalLayoutState(`${rootId || "pending-root"}:${cwd || "root"}`, rootId || "default");
  const { layout } = layoutApi;
  const activeTab = React.useMemo(
    () => layout.tabs.find((tab) => tab.tabId === layout.activeTabId) ?? layout.tabs[0],
    [layout.activeTabId, layout.tabs],
  );
  const activePaneCount = activeTab ? Object.keys(activeTab.panes).length : 0;
  const [profiles, setProfiles] = React.useState<TerminalProfileDescriptor[]>([]);

  React.useEffect(() => {
    const controller = new AbortController();
    getTerminalProfiles(controller.signal)
      .then((catalog) => setProfiles(catalog.profiles.filter((profile) => profile.kind === "shell" && profile.targetKind === "local")))
      .catch(() => setProfiles([]));
    return () => controller.abort();
  }, []);
  const cwdAbsolutePath = React.useMemo(() => joinAbsolutePath(rootAbsolutePath, cwd), [cwd, rootAbsolutePath]);

  React.useEffect(() => {
    schedulePendingTerminalKillFlush(500);
  }, []);

  const killTabSessions = React.useCallback(async (tabsToKill: Array<NonNullable<typeof activeTab>>) => {
    const terminalIds = tabsToKill.flatMap((tab) => Object.values(tab.panes).map((pane) => pane.terminalId));
    if (!terminalIds.length) return { failed: 0 };
    const results = await Promise.allSettled(
      terminalIds.map((terminalId) => endWorkbenchTerminalSession(terminalId, { attempts: 3, queueOnFailure: true })),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      toast.warning("终端已从界面强制关闭，后台会继续重试清理残留进程", {
        description: `${failed}/${terminalIds.length} 个 session 未即时确认 kill，已加入持久重试队列。`,
      });
    }
    return { failed };
  }, []);

  const splitTab = React.useCallback((tabId: string, orientation: "horizontal" | "vertical") => {
    if (tabId === layout.activeTabId) {
      layoutApi.splitActivePane(orientation);
      return;
    }
    layoutApi.splitTabById(tabId, orientation);
  }, [layout.activeTabId, layoutApi]);

  const closeTab = React.useCallback(async (tab: NonNullable<typeof activeTab>) => {
    await killTabSessions([tab]);
    layoutApi.closeTab(tab.tabId);
  }, [killTabSessions, layoutApi]);

  const closeOtherTabs = React.useCallback(async (tab: NonNullable<typeof activeTab>) => {
    await killTabSessions(layout.tabs.filter((item) => item.tabId !== tab.tabId));
    layoutApi.closeOtherTabs(tab.tabId);
  }, [killTabSessions, layout.tabs, layoutApi]);

  const closeTabsToRight = React.useCallback(async (tab: NonNullable<typeof activeTab>) => {
    const index = layout.tabs.findIndex((item) => item.tabId === tab.tabId);
    if (index < 0) return;
    await killTabSessions(layout.tabs.slice(index + 1));
    layoutApi.closeTabsToRight(tab.tabId);
  }, [killTabSessions, layout.tabs, layoutApi]);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-panel text-ink" data-ide-terminal-panel data-ide-terminal-placement={placement}>
      <TerminalTabs
        tabs={layout.tabs}
        activeTabId={layout.activeTabId}
        onFocusTab={layoutApi.setActiveTab}
        onNewTerminal={layoutApi.newTerminal}
        profiles={profiles}
        onSplitTab={splitTab}
        onCloseTab={(tab) => void closeTab(tab)}
        onCloseOtherTabs={(tab) => void closeOtherTabs(tab)}
        onCloseTabsToRight={(tab) => void closeTabsToRight(tab)}
        onMoveTab={layoutApi.moveTab}
        onReorderTab={layoutApi.reorderTab}
        cwdLabel={placement === "right" ? undefined : cwdAbsolutePath}
        metaLabel={placement === "right" ? undefined : `${layout.tabs.length} tab${layout.tabs.length > 1 ? "s" : ""} · ${activePaneCount} pane${activePaneCount > 1 ? "s" : ""}`}
      />
      <div className="min-h-0 min-w-0" data-ide-terminal-layout data-terminal-tab-count={layout.tabs.length} data-terminal-pane-count={activePaneCount} data-terminal-active-tab-id={layout.activeTabId} data-terminal-active-pane-id={layout.activePaneId}>
        {active && activeTab ? (
          <TerminalGroupView
            key={activeTab.tabId}
            node={activeTab.root}
            panes={activeTab.panes}
            rootId={rootId}
            cwd={cwd}
            cwdAbsolutePath={cwdAbsolutePath}
            activePaneId={activeTab.activePaneId}
            compact={placement === "right"}
            showPaneHeader={activePaneCount > 1}
            onFocusPane={layoutApi.setActivePane}
            onClosePane={layoutApi.closePane}
            onResizeSplit={layoutApi.resizeSplit}
          />
        ) : null}
      </div>
    </div>
  );
}

function normalizePanelCwd(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function joinAbsolutePath(rootAbsolutePath: string | undefined, relativePath: string): string {
  if (!rootAbsolutePath) return normalizePanelCwd(relativePath);
  const root = rootAbsolutePath.replace(/[\/]+$/, "");
  const child = normalizePanelCwd(relativePath);
  return child ? `${root}/${child}` : root;
}
