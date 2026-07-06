import * as React from "react";
import type { TerminalProfileDescriptor } from "@/features/cli-agents/types";
import { getTerminalProfiles, renameTerminalSession } from "@/lib/api/terminal";
import { toast } from "@/design/ui/sonner";
import { endWorkbenchTerminalSession, schedulePendingTerminalKillFlush } from "./terminalClient";
import { useTerminalLayoutState } from "./terminalLayoutState";
import { TerminalGroupView } from "./TerminalGroupView";
import { TerminalManagerDialog } from "./TerminalManagerDialog";
import { TerminalTabs } from "./TerminalTabs";

const TERMINAL_DEFAULT_PROFILE_KEY = "tracevane.ide-workbench.terminal.default-profile";

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
  const { layout, ready: layoutReady } = layoutApi;
  const activeTab = React.useMemo(
    () => layout.tabs.find((tab) => tab.tabId === layout.activeTabId) ?? layout.tabs[0],
    [layout.activeTabId, layout.tabs],
  );
  const activePaneCount = activeTab ? Object.keys(activeTab.panes).length : 0;
  const [profiles, setProfiles] = React.useState<TerminalProfileDescriptor[]>([]);
  const [defaultProfileId, setDefaultProfileId] = React.useState<string | null>(() => loadDefaultTerminalProfileId());
  const [managerOpen, setManagerOpen] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    getTerminalProfiles(controller.signal)
      .then((catalog) => setProfiles(catalog.profiles))
      .catch(() => setProfiles([]));
    return () => controller.abort();
  }, []);
  const cwdAbsolutePath = React.useMemo(() => joinAbsolutePath(rootAbsolutePath, cwd), [cwd, rootAbsolutePath]);
  const setDefaultTerminalProfile = React.useCallback((profile: TerminalProfileDescriptor) => {
    setDefaultProfileId(profile.id);
    saveDefaultTerminalProfileId(profile.id);
    toast.success("已设置默认终端", {
      description: `${profile.labelZh || profile.label} · ${profile.command}`,
    });
  }, []);
  const newTerminalWithDefault = React.useCallback(() => {
    layoutApi.newTerminal(createDefaultProfileSelection(profiles, defaultProfileId));
  }, [defaultProfileId, layoutApi, profiles]);
  const activeTerminalIds = React.useMemo(() =>
    layout.tabs.flatMap((tab) => Object.values(tab.panes).map((pane) => pane.terminalId)),
  [layout.tabs]);
  const terminalTitlesById = React.useMemo(() => {
    const titles: Record<string, string> = {};
    for (const tab of layout.tabs) {
      for (const pane of Object.values(tab.panes)) {
        const terminalId = pane.terminalId;
        if (!terminalId) continue;
        titles[terminalId] = pane.title || tab.title || terminalId;
      }
    }
    return titles;
  }, [layout.tabs]);

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
        defaultProfileId={defaultProfileId}
        onSetDefaultProfile={setDefaultTerminalProfile}
        onSplitTab={splitTab}
        onCloseTab={(tab) => void closeTab(tab)}
        onCloseOtherTabs={(tab) => void closeOtherTabs(tab)}
        onCloseTabsToRight={(tab) => void closeTabsToRight(tab)}
        onMoveTab={layoutApi.moveTab}
        onReorderTab={layoutApi.reorderTab}
        onRenameTab={(tab, title) => {
          layoutApi.renameTab(tab.tabId, title);
          const terminalIds = [...new Set(Object.values(tab.panes).map((pane) => pane.terminalId).filter(Boolean))];
          if (terminalIds.length) {
            void Promise.allSettled(terminalIds.map((terminalId) => renameTerminalSession(terminalId, title))).then((results) => {
              const failed = results.filter((result) => result.status === "rejected");
              if (!failed.length) return;
              const first = failed[0];
              const reason = first.status === "rejected" ? first.reason : null;
              toast.warning("终端标签已重命名，但 session 标题同步失败", {
                description: reason instanceof Error ? reason.message : String(reason || "unknown error"),
              });
            });
          }
        }}
        onOpenManager={() => setManagerOpen(true)}
        compact={placement === "right"}
        cwdLabel={placement === "right" ? undefined : cwdAbsolutePath}
        metaLabel={placement === "right" ? undefined : `${layout.tabs.length} tab${layout.tabs.length > 1 ? "s" : ""} · ${activePaneCount} pane${activePaneCount > 1 ? "s" : ""}`}
      />
      <div className="min-h-0 min-w-0" data-ide-terminal-layout data-terminal-tab-count={layout.tabs.length} data-terminal-pane-count={activePaneCount} data-terminal-active-tab-id={layout.activeTabId} data-terminal-active-pane-id={layout.activePaneId}>
        {!layoutReady ? (
          <div className="grid h-full place-items-center p-6 text-center" data-ide-terminal-loading>
            <div className="max-w-md rounded-lg border border-line bg-canvas px-6 py-5 text-sm text-muted">
              正在恢复终端布局…
            </div>
          </div>
        ) : active && activeTab ? (
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
        ) : (
          <div className="grid h-full place-items-center p-6 text-center" data-ide-terminal-empty>
            <div className="max-w-md rounded-lg border border-dashed border-line bg-canvas px-6 py-5 text-sm text-muted">
              <div className="text-base font-medium text-ink-strong">没有正在运行的终端</div>
              <p className="mt-2 leading-relaxed">
                已关闭全部终端。点击右上角“新建”创建 workspace 终端，或打开终端管理器恢复仍可恢复的 session。
              </p>
              <button
                type="button"
                className="mt-4 rounded-sm border border-line-2 bg-panel px-3 py-1.5 text-sm font-medium text-ink hover:border-primary-line hover:bg-panel-2"
                onClick={newTerminalWithDefault}
                data-ide-terminal-empty-new
              >
                新建终端
              </button>
            </div>
          </div>
        )}
      </div>
      <TerminalManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        currentRootId={rootId}
        currentRootLabel={rootId}
        activeTerminalIds={activeTerminalIds}
        visibleTerminalId={activeTab?.activeTerminalId ?? null}
        terminalTitlesById={terminalTitlesById}
        onAttachSession={(session) => {
          layoutApi.attachSessionDescriptor(session);
          setManagerOpen(false);
        }}
        onClosedSessions={layoutApi.removeTerminalIds}
      />
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


function loadDefaultTerminalProfileId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(TERMINAL_DEFAULT_PROFILE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function saveDefaultTerminalProfileId(profileId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TERMINAL_DEFAULT_PROFILE_KEY, profileId);
  } catch {
    // Ignore storage failures; the current session still uses React state.
  }
}


function createDefaultProfileSelection(
  profiles: TerminalProfileDescriptor[],
  defaultProfileId: string | null,
): { profileId?: string | null; shell?: string | null; label?: string | null } | undefined {
  const shellProfiles = profiles
    .filter((profile) => profile.kind === "shell" && profile.targetKind === "local" && profile.launchable)
    .filter((profile) => !/tmux/i.test(profile.id) && !/tmux/i.test(profile.command));
  const profile = (defaultProfileId ? shellProfiles.find((item) => item.id === defaultProfileId) : null)
    ?? shellProfiles.find((item) => item.id === "local-shell")
    ?? shellProfiles[0];
  if (!profile) return undefined;
  return {
    profileId: profile.id,
    shell: profile.command,
    label: profile.id === "local-shell" ? "Terminal" : (profile.labelZh || profile.label),
  };
}
