import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  MoreHorizontal,
  MonitorCog,
  PanelTopOpen,
  Pencil,
  Plus,
  Split,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { DragFloatingPreview } from "@/shared/explorer-ui";
import type { TerminalProfileDescriptor } from "@/features/cli-agents/types";
import type { TerminalProfileSelection, TerminalSplitOrientation, TerminalTabRecord } from "./terminalLayoutTypes";

interface TerminalTabMenuState {
  tab: TerminalTabRecord;
  x: number;
  y: number;
}

export function TerminalTabs({
  tabs,
  activeTabId,
  onFocusTab,
  onNewTerminal,
  profiles = [],
  defaultProfileId = null,
  onSetDefaultProfile,
  onSplitTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onMoveTab,
  onReorderTab,
  onRenameTab,
  cwdLabel,
  metaLabel,
  onOpenManager,
  compact = false,
}: {
  tabs: TerminalTabRecord[];
  activeTabId: string;
  onFocusTab: (tabId: string) => void;
  onNewTerminal: (profile?: TerminalProfileSelection) => void;
  profiles?: TerminalProfileDescriptor[];
  defaultProfileId?: string | null;
  onSetDefaultProfile?: (profile: TerminalProfileDescriptor) => void;
  onSplitTab: (tabId: string, orientation: TerminalSplitOrientation) => void;
  onCloseTab: (tab: TerminalTabRecord) => void;
  onCloseOtherTabs: (tab: TerminalTabRecord) => void;
  onCloseTabsToRight: (tab: TerminalTabRecord) => void;
  onMoveTab: (tabId: string, direction: -1 | 1) => void;
  onReorderTab: (tabId: string, targetTabId: string, placement?: "before" | "after") => void;
  onRenameTab: (tab: TerminalTabRecord, title: string) => void;
  cwdLabel?: string;
  metaLabel?: string;
  onOpenManager?: () => void;
  compact?: boolean;
}) {
  const [menu, setMenu] = React.useState<TerminalTabMenuState | null>(null);
  const [newMenu, setNewMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [draggingTabId, setDraggingTabId] = React.useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<{ targetTabId: string; placement: "before" | "after" } | null>(null);
  const [dragPreview, setDragPreview] = React.useState<{ x: number; y: number; label: string; width: number; paneCount: number } | null>(null);
  const suppressNextClickRef = React.useRef(false);

  React.useEffect(() => {
    if (!menu && !newMenu) return;
    const close = () => { setMenu(null); setNewMenu(null); };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menu, newMenu]);

  const openMenu = React.useCallback((tab: TerminalTabRecord, point: { x: number; y: number }) => {
    onFocusTab(tab.tabId);
    const position = positionTerminalTabMenu(point.x, point.y);
    setMenu({ tab, x: position.x, y: position.y });
  }, [onFocusTab]);

  const runMenuAction = React.useCallback((action: () => void) => {
    action();
    setMenu(null);
  }, []);

  const renameTabFromMenu = React.useCallback((tab: TerminalTabRecord) => {
    const nextTitle = window.prompt("重命名终端标签", tab.title);
    if (nextTitle === null) return;
    const normalized = nextTitle.trim();
    if (!normalized || normalized === tab.title) return;
    onRenameTab(tab, normalized);
  }, [onRenameTab]);

  const beginPointerTabDrag = React.useCallback((tab: TerminalTabRecord, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("[data-ide-terminal-tab-menu]")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const tabId = tab.tabId;
    const tabRect = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let pendingDrop: { targetTabId: string; placement: "before" | "after" } | null = null;
    setDragPreview(null);
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (distance < 6 && !moved) return;
      moveEvent.preventDefault();
      if (!moved) document.body.style.cursor = "grabbing";
      moved = true;
      setDraggingTabId(tabId);
      setDragPreview({ x: moveEvent.clientX, y: moveEvent.clientY, label: tab.title, width: tabRect.width, paneCount: Object.keys(tab.panes).length });
      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>("[data-ide-terminal-tab-wrap]");
      const targetTabId = target?.dataset.terminalTabId;
      if (targetTabId && targetTabId !== tabId) {
        const rect = target.getBoundingClientRect();
        const placement = moveEvent.clientX > rect.left + rect.width / 2 ? "after" : "before";
        pendingDrop = { targetTabId, placement };
        setDropIndicator(pendingDrop);
      } else {
        pendingDrop = null;
        setDropIndicator(null);
      }
    };
    const clearDrag = () => {
      document.body.style.cursor = "";
      setDraggingTabId(null);
      setDropIndicator(null);
      setDragPreview(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", clearDrag);
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (moved) {
        upEvent.preventDefault();
        suppressNextClickRef.current = true;
        if (pendingDrop) onReorderTab(tabId, pendingDrop.targetTabId, pendingDrop.placement);
      } else {
        // The tab wrapper owns pointer tracking for drag-sort. In some browsers,
        // pointer capture can prevent the nested button click from becoming the
        // reliable focus signal, so treat a non-drag pointer-up on the tab body
        // as an explicit tab activation. The menu button is excluded before drag
        // tracking starts, so its click still only opens the menu.
        onFocusTab(tabId);
      }
      clearDrag();
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { once: true, passive: false });
    window.addEventListener("pointercancel", clearDrag, { once: true });
  }, [onFocusTab, onReorderTab]);

  return (
    <div className="flex min-h-8 min-w-0 items-center gap-1 border-b border-line bg-panel-2 px-2" data-ide-terminal-tabs>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
        {tabs.map((tab) => {
          const paneCount = Object.keys(tab.panes).length;
          const active = activeTabId === tab.tabId;
          const activePane = tab.panes[tab.activePaneId];
          return (
            <div
              key={tab.tabId}
              className={cn(
                "group/tab relative z-10 inline-flex min-h-6 max-w-[128px] shrink-0 cursor-grab items-center overflow-hidden rounded-sm border outline-none active:cursor-grabbing focus-within:shadow-[var(--ring)] sm:max-w-[150px]",
                active
                  ? "border-primary-line bg-primary-soft text-ink-strong"
                  : "border-line bg-panel text-muted hover:text-ink",
                draggingTabId === tab.tabId && "scale-[0.98] cursor-grabbing border-primary-line bg-primary-soft/80 opacity-45 shadow-[0_0_0_1px_var(--primary)]",
                dropIndicator?.targetTabId === tab.tabId &&
                  "overflow-visible ring-2 ring-primary/20",
              )}
              data-ide-terminal-tab-wrap
              data-terminal-tab-id={tab.tabId}
              onPointerDown={(event) => beginPointerTabDrag(tab, event)}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(tab, { x: event.clientX, y: event.clientY });
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  onFocusTab(tab.tabId);
                }}
                className="inline-flex min-w-0 flex-1 cursor-inherit items-center gap-1.5 px-2 py-1 text-left text-xs outline-none"
                data-ide-terminal-tab
                data-terminal-tab-id={tab.tabId}
                data-terminal-id={tab.activeTerminalId}
                data-terminal-profile-id={activePane?.profileId || undefined}
                data-terminal-shell={activePane?.shell || undefined}
                data-active-terminal-tab={active ? "true" : "false"}
              >
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <TerminalIcon className="size-3.5 shrink-0 text-subtle" />
                <span className="truncate">{tab.title}</span>
                {paneCount > 1 ? (
                  <span className="rounded-full border border-line bg-panel px-1 font-mono text-2xs text-muted">
                    {paneCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="relative z-20 grid size-6 shrink-0 cursor-pointer place-items-center text-subtle outline-none hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]"
                aria-label={`${tab.title} 操作菜单`}
                title="终端标签操作"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openMenu(tab, { x: rect.right - 4, y: rect.bottom + 4 });
                }}
                data-ide-terminal-tab-menu
                data-terminal-tab-id={tab.tabId}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
              {dropIndicator?.targetTabId === tab.tabId ? (
                <span
                  className={cn(
                    "pointer-events-none absolute inset-y-0 z-20 w-1 rounded-full bg-primary shadow-[0_0_0_3px_var(--primary-soft),0_0_18px_var(--primary)]",
                    dropIndicator.placement === "before" ? "-left-1" : "-right-1",
                  )}
                  aria-hidden="true"
                  data-ide-terminal-tab-drop-indicator={dropIndicator.placement}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
        {cwdLabel || metaLabel ? (
          <span
            className="pointer-events-none hidden max-w-[22vw] truncate px-1 text-2xs text-muted xl:inline"
            title={cwdLabel}
            data-ide-terminal-status
          >
            {metaLabel}
            {cwdLabel ? ` · ${cwdLabel}` : ""}
          </span>
        ) : null}
        {onOpenManager ? (
          <Button variant="ghost" size="sm" onClick={onOpenManager} data-ide-terminal-manager-open aria-label="终端管理器" title="终端管理器" className="shrink-0 px-2">
            <MonitorCog />
            <span className="hidden lg:inline">终端管理</span>
          </Button>
        ) : null}
        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-line bg-panel">
          <Button variant="ghost" size="sm" onClick={() => onNewTerminal(defaultTerminalProfile(profiles, defaultProfileId))} data-ide-terminal-new aria-label="新建终端" title="新建终端" className="h-8 shrink-0 rounded-none border-0 px-2 text-xs">
            <Plus className="size-3.5" />
            <span className={cn(compact ? "hidden" : "hidden md:inline")}>新建</span>
          </Button>
          <button
            type="button"
            className="grid h-8 w-7 place-items-center border-l border-line text-subtle outline-none hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]"
            aria-label="选择终端 Shell/Profile"
            title="选择终端 Shell/Profile"
            data-ide-terminal-new-menu
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setNewMenu((current) => current ? null : positionNewTerminalMenu(rect));
            }}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
      </div>
      {dragPreview ? (
        <DragFloatingPreview
          x={dragPreview.x}
          y={dragPreview.y}
          width={Math.min(Math.max(dragPreview.width + 12, 170), 240)}
          icon={<TerminalIcon className="size-3.5" />}
          title={dragPreview.label}
          subtitle="松手调整标签顺序"
          badge={dragPreview.paneCount > 1 ? `${dragPreview.paneCount} 分屏` : undefined}
          tone="terminal"
          dataAttributes={{ "data-ide-terminal-tab-drag-preview": "true" }}
          data-testid="ide-terminal-tab-drag-preview"
        />
      ) : null}
      {newMenu ? (
        <TerminalNewProfileMenu
          x={newMenu.x}
          y={newMenu.y}
          profiles={profiles}
          defaultProfileId={defaultProfileId}
          onSetDefaultProfile={onSetDefaultProfile}
          onSelect={(profile) => {
            onNewTerminal(profile);
            setNewMenu(null);
          }}
        />
      ) : null}
      {menu ? (
        <div
          role="menu"
          className="fixed z-50 min-w-56 overflow-y-auto rounded-md border border-line bg-panel p-1 text-sm text-ink shadow-lg"
          style={{ left: menu.x, top: menu.y, maxHeight: `calc(100vh - ${menu.y + 8}px)` }}
          onPointerDown={(event) => event.stopPropagation()}
          data-ide-terminal-tab-context-menu
          data-terminal-tab-id={menu.tab.tabId}
        >
          <TerminalMenuButton
            icon={<Pencil />}
            label="重命名"
            onClick={() => runMenuAction(() => renameTabFromMenu(menu.tab))}
            dataAttr="rename"
          />
          <div className="my-1 border-t border-line" />
          <TerminalMenuButton
            icon={<ArrowLeft />}
            label="左移"
            onClick={() => runMenuAction(() => onMoveTab(menu.tab.tabId, -1))}
            dataAttr="move-left"
          />
          <TerminalMenuButton
            icon={<ArrowRight />}
            label="右移"
            onClick={() => runMenuAction(() => onMoveTab(menu.tab.tabId, 1))}
            dataAttr="move-right"
          />
          <div className="my-1 border-t border-line" />
          <TerminalMenuButton
            icon={<Split />}
            label="向右拆分"
            onClick={() => runMenuAction(() => onSplitTab(menu.tab.tabId, "horizontal"))}
            dataAttr="split-right"
          />
          <TerminalMenuButton
            icon={<PanelTopOpen />}
            label="向下拆分"
            onClick={() => runMenuAction(() => onSplitTab(menu.tab.tabId, "vertical"))}
            dataAttr="split-down"
          />
          <div className="my-1 border-t border-line" />
          <TerminalMenuButton
            icon={<X />}
            label="关闭标签"
            onClick={() => runMenuAction(() => onCloseTab(menu.tab))}
            dataAttr="close-tab"
          />
          <TerminalMenuButton
            icon={<X />}
            label="关闭其他标签"
            onClick={() => runMenuAction(() => onCloseOtherTabs(menu.tab))}
            dataAttr="close-others"
          />
          <TerminalMenuButton
            icon={<X />}
            label="关闭右侧标签"
            onClick={() => runMenuAction(() => onCloseTabsToRight(menu.tab))}
            dataAttr="close-right"
          />
        </div>
      ) : null}
    </div>
  );
}


function positionTerminalTabMenu(x: number, y: number): { x: number; y: number } {
  const width = 224;
  const height = 286;
  const padding = 8;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
  const maxX = Math.max(padding, viewportWidth - width - padding);
  const maxY = Math.max(padding, viewportHeight - height - padding);
  return {
    x: Math.max(padding, Math.min(x, maxX)),
    y: Math.max(padding, Math.min(y, maxY)),
  };
}

function positionNewTerminalMenu(rect: DOMRect): { x: number; y: number } {
  const width = 288;
  const height = 320;
  const padding = 8;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height;
  const preferredX = rect.right - width;
  const preferredY = rect.bottom + 4;
  const maxX = Math.max(padding, viewportWidth - width - padding);
  const maxY = Math.max(padding, viewportHeight - height - padding);
  return {
    x: Math.max(padding, Math.min(preferredX, maxX)),
    y: Math.max(padding, Math.min(preferredY, maxY)),
  };
}

function TerminalNewProfileMenu({
  x,
  y,
  profiles,
  onSelect,
  defaultProfileId,
  onSetDefaultProfile,
}: {
  x: number;
  y: number;
  profiles: TerminalProfileDescriptor[];
  onSelect: (profile: TerminalProfileSelection) => void;
  defaultProfileId?: string | null;
  onSetDefaultProfile?: (profile: TerminalProfileDescriptor) => void;
}) {
  const launchable = normalizeLaunchableProfiles(profiles);
  const unavailable = normalizeUnavailableShellProfiles(profiles);
  const selectProfile = React.useCallback((profile: TerminalProfileDescriptor) => {
    onSelect(profileToSelection(profile));
  }, [onSelect]);
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-72 overflow-y-auto rounded-md border border-line bg-panel p-1 text-sm text-ink shadow-lg"
      style={{ left: x, top: y, maxHeight: `calc(100vh - ${y + 8}px)` }}
      onPointerDown={(event) => event.stopPropagation()}
      data-ide-terminal-new-profile-menu
    >
      <div className="px-2 pb-1 pt-1 text-2xs font-medium uppercase tracking-wide text-muted">可创建的本地 Shell</div>
      {launchable.length ? launchable.map((profile) => (
        <TerminalProfileMenuItem
          key={profile.id}
          profile={profile}
          isDefault={profile.id === resolveDefaultProfileId(profiles, defaultProfileId)}
          onSelect={selectProfile}
          onSetDefault={onSetDefaultProfile}
        />
      )) : (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)]"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect({ profileId: "local-shell", shell: "bash", label: "Terminal" });
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          data-ide-terminal-new-profile="local-shell"
          data-terminal-shell="bash"
        >
          <TerminalIcon className="size-3.5 text-subtle" />
          <span className="min-w-0 flex-1 truncate">默认终端</span>
          <span className="rounded bg-panel-3 px-1 font-mono text-2xs text-muted">bash</span>
        </button>
      )}
      {unavailable.length ? (
        <>
          <div className="my-1 border-t border-line" />
          <div className="px-2 pb-1 pt-1 text-2xs font-medium uppercase tracking-wide text-muted">未安装 / 暂不可用</div>
          {unavailable.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="menuitem"
              disabled
              className="flex w-full cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-left text-muted opacity-70"
              title={profile.descriptionZh || profile.description}
              data-ide-terminal-new-profile-disabled={profile.id}
              data-terminal-shell={profile.command}
            >
              <TerminalIcon className="size-3.5 text-subtle" />
              <span className="min-w-0 flex-1 truncate">{profile.labelZh || profile.label}</span>
              <span className="rounded bg-panel-3 px-1 font-mono text-2xs text-muted">{profile.command}</span>
              <span className="rounded bg-warning-soft px-1 text-2xs text-warning">不可用</span>
            </button>
          ))}
        </>
      ) : null}
      <div className="my-1 border-t border-line" />
      <div className="px-2 py-1 text-2xs leading-relaxed text-muted">
        仅创建已安装本地 Shell；tmux/Agent 不作为 Shell。
      </div>
    </div>
  );
}

function TerminalProfileMenuItem({
  profile,
  isDefault,
  onSelect,
  onSetDefault,
}: {
  profile: TerminalProfileDescriptor;
  isDefault: boolean;
  onSelect: (profile: TerminalProfileDescriptor) => void;
  onSetDefault?: (profile: TerminalProfileDescriptor) => void;
}) {
  const run = React.useCallback(() => onSelect(profile), [onSelect, profile]);
  const setDefault = React.useCallback(() => onSetDefault?.(profile), [onSetDefault, profile]);
  return (
    <div className="flex w-full items-center gap-1 rounded-sm hover:bg-panel-3 focus-within:shadow-[var(--ring)]" role="none">
      <button
        type="button"
        role="menuitem"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left outline-none"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          run();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        data-ide-terminal-new-profile={profile.id}
        data-terminal-shell={profile.command}
      >
        <TerminalIcon className="size-3.5 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate">{profile.labelZh || profile.label}</span>
        <span className="rounded bg-panel-3 px-1 font-mono text-2xs text-muted">{profile.command}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!onSetDefault || isDefault}
        className={cn(
          "mr-1 shrink-0 rounded px-1.5 py-0.5 text-2xs outline-none focus-visible:shadow-[var(--ring)]",
          isDefault
            ? "cursor-default bg-primary-soft text-primary"
            : "text-muted hover:bg-panel hover:text-ink",
        )}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isDefault) setDefault();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        data-ide-terminal-set-default-profile={profile.id}
        data-ide-terminal-default-profile={isDefault ? "true" : "false"}
        title={isDefault ? "当前默认终端" : "设为默认终端"}
      >
        {isDefault ? "默认" : "设默认"}
      </button>
    </div>
  );
}

function normalizeShellProfiles(profiles: TerminalProfileDescriptor[]): TerminalProfileDescriptor[] {
  const shellProfiles = profiles
    .filter((profile) => profile.kind === "shell" && profile.targetKind === "local")
    .filter((profile) => !/tmux/i.test(profile.id) && !/tmux/i.test(profile.command));
  const local = shellProfiles.find((profile) => profile.id === "local-shell");
  const rest = shellProfiles.filter((profile) => profile.id !== "local-shell");
  return local ? [local, ...rest] : shellProfiles;
}

function normalizeLaunchableProfiles(profiles: TerminalProfileDescriptor[]): TerminalProfileDescriptor[] {
  return normalizeShellProfiles(profiles).filter((profile) => profile.launchable);
}

function normalizeUnavailableShellProfiles(profiles: TerminalProfileDescriptor[]): TerminalProfileDescriptor[] {
  return normalizeShellProfiles(profiles).filter((profile) => !profile.launchable);
}

function resolveDefaultProfileId(profiles: TerminalProfileDescriptor[], defaultProfileId?: string | null): string | null {
  const launchable = normalizeLaunchableProfiles(profiles);
  const preferred = defaultProfileId ? launchable.find((profile) => profile.id === defaultProfileId) : null;
  const local = launchable.find((profile) => profile.id === "local-shell") ?? launchable[0] ?? null;
  return (preferred ?? local)?.id ?? null;
}

function defaultTerminalProfile(profiles: TerminalProfileDescriptor[], defaultProfileId?: string | null): TerminalProfileSelection {
  const launchable = normalizeLaunchableProfiles(profiles);
  const resolvedId = resolveDefaultProfileId(profiles, defaultProfileId);
  const profile = resolvedId ? launchable.find((item) => item.id === resolvedId) : null;
  return profile ? profileToSelection(profile) : { profileId: "local-shell", shell: "bash", label: "Terminal" };
}

function profileToSelection(profile: TerminalProfileDescriptor): TerminalProfileSelection {
  return {
    profileId: profile.id,
    shell: profile.command,
    label: profile.id === "local-shell" ? "Terminal" : (profile.labelZh || profile.label),
  };
}

function TerminalMenuButton({
  icon,
  label,
  onClick,
  dataAttr,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  dataAttr: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)] [&_svg]:size-3.5"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.dataset.pointerFired = "true";
        onClick();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        if (target.dataset.pointerFired === "true") {
          delete target.dataset.pointerFired;
          return;
        }
        onClick();
      }}
      data-ide-terminal-tab-menu-item={dataAttr}
      data-ide-terminal-split-right={dataAttr === "split-right" ? "true" : undefined}
      data-ide-terminal-split-down={dataAttr === "split-down" ? "true" : undefined}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
