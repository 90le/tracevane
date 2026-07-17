import "dockview-react/dist/styles/dockview.css";
import "./EditorDock.css";

import * as React from "react";
import { createPortal } from "react-dom";
import type {
  DockviewApi,
  DockviewReadyEvent,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  IWatermarkPanelProps,
  SerializedDockview,
} from "dockview-react";
import { DockviewReact } from "dockview-react";
import { CheckCheck, Code2, Copy, Eye, FileText, MoreHorizontal, Pin, Save, Sparkles, SplitSquareHorizontal, SplitSquareVertical, TextCursorInput, X } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/design/ui/state";
import type { EditorSaveState } from "@/shared/editor-core";
import type { IdeGitDecoration } from "../git";
import type { IdeWorkbenchEditorFileMetadata, IdeWorkbenchEditorTab } from "../types";
import { runIdeEditorAction, saveIdeEditorTab } from "./ideEditorRuntime";
import { EditorDockCallbacksContext, EditorPlaceholderPanel, type EditorPlaceholderParams } from "./EditorPlaceholderPanel";
import { useIdeEditorPreferences, type IdeEditorPreferences } from "./editorPreferences";

export interface EditorDockProps {
  tabs: readonly IdeWorkbenchEditorTab[];
  activeTabId: string | null;
  dockviewLayout: SerializedDockview | null;
  onDockviewLayoutChange: (layout: SerializedDockview | null) => void;
  onActiveTabChange: (tabId: string | null) => void;
  onPinTab: (tabId: string) => void;
  onDirtyChange: (tabId: string, dirty: boolean) => void;
  onSaveStateChange: (tabId: string, saveState: EditorSaveState, message?: string | null) => void;
  onFileMetadataChange: (tabId: string, metadata: IdeWorkbenchEditorFileMetadata) => void;
  onRequestCloseTabs: (tabIds: string[]) => void;
  gitDecorations?: ReadonlyMap<string, IdeGitDecoration>;
}

const EDITOR_COMPONENT = "tracevane.editor.placeholder";

const EditorDockHeaderActionsContext = React.createContext<{
  tabs: readonly IdeWorkbenchEditorTab[];
  onRequestCloseTabs: (tabIds: string[]) => void;
  onSplitEditor: (direction: "right" | "below", referencePanelId?: string) => void;
  preferences: IdeEditorPreferences;
  onPreferencesChange: (patch: Partial<IdeEditorPreferences>) => void;
} | null>(null);

export function EditorDock({
  tabs,
  activeTabId,
  dockviewLayout,
  onDockviewLayoutChange,
  onActiveTabChange,
  onPinTab,
  onDirtyChange,
  onSaveStateChange,
  onFileMetadataChange,
  onRequestCloseTabs,
  gitDecorations,
}: EditorDockProps) {
  const apiRef = React.useRef<DockviewApi | null>(null);
  const disposablesRef = React.useRef<Array<{ dispose: () => void }>>([]);
  const restoredRef = React.useRef(false);
  const saveLayoutRef = React.useRef(onDockviewLayoutChange);
  const tabsRef = React.useRef(tabs);
  const [preferences, updatePreferences] = useIdeEditorPreferences();

  React.useEffect(() => {
    saveLayoutRef.current = onDockviewLayoutChange;
  }, [onDockviewLayoutChange]);

  React.useEffect(() => {
    return () => {
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
      apiRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const saveCurrentLayout = React.useCallback(() => {
    const api = apiRef.current;
    saveLayoutRef.current(api && api.totalPanels > 0 ? api.toJSON() : null);
  }, []);

  const syncTabsToDockview = React.useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const tabIds = new Set(tabsRef.current.map((tab) => tab.id));
    for (const panel of api.panels) {
      const params = panel.params as EditorPlaceholderParams | undefined;
      const panelTabId = editorPanelTabId(panel);
      if ((params?.kind === "file" || params?.kind === "git-diff") && (!panelTabId || !tabIds.has(panelTabId))) {
        api.removePanel(panel);
      }
    }
    for (const tab of tabsRef.current) {
      const params = filePanelParams(tab);
      const existingPanels = [...api.panels].filter((panel) => editorPanelTabId(panel) === tab.id);
      if (existingPanels.length > 0) {
        for (const panel of existingPanels) {
          panel.setTitle(tabTitle(tab));
          panel.update({ params });
        }
        continue;
      }
      api.addPanel<EditorPlaceholderParams>({
        id: tab.id,
        title: tabTitle(tab),
        component: EDITOR_COMPONENT,
        params,
      });
    }
  }, []);

  React.useEffect(() => {
    const api = apiRef.current;
    if (api && !dockviewLayout && tabs.length === 0 && api.totalPanels > 0) {
      api.clear();
      saveLayoutRef.current(null);
      return;
    }
    syncTabsToDockview();
    if (!api || !activeTabId) return;
    const activePanelTabId = api.activePanel ? editorPanelTabId(api.activePanel) : null;
    if (activePanelTabId === activeTabId) return;
    const targetPanel = api.getPanel(activeTabId) ?? [...api.panels].find((panel) => editorPanelTabId(panel) === activeTabId);
    targetPanel?.api.setActive();
  }, [activeTabId, dockviewLayout, syncTabsToDockview, tabs]);

  const handleReady = React.useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      if (dockviewLayout && !restoredRef.current) {
        try {
          event.api.fromJSON(dockviewLayout, { reuseExistingPanels: true });
        } catch {
          event.api.clear();
          saveLayoutRef.current(null);
        }
      }
      restoredRef.current = true;
      syncTabsToDockview();
      if (activeTabId) {
        const targetPanel = event.api.getPanel(activeTabId) ?? [...event.api.panels].find((panel) => editorPanelTabId(panel) === activeTabId);
        targetPanel?.api.setActive();
      }

      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [
        event.api.onDidLayoutChange(() => saveCurrentLayout()),
        event.api.onDidActivePanelChange((change) => {
          const nextId = change.panel ? editorPanelTabId(change.panel) : null;
          onActiveTabChange(nextId && tabsRef.current.some((tab) => tab.id === nextId) ? nextId : null);
        }),
        event.api.onDidRemovePanel((panel) => {
          if (editorPanelTabId(panel) === activeTabId) {
            const nextId = event.api.activePanel ? editorPanelTabId(event.api.activePanel) : null;
            onActiveTabChange(nextId && tabsRef.current.some((tab) => tab.id === nextId) ? nextId : null);
          }
          saveCurrentLayout();
        }),
      ];
    },
    [activeTabId, dockviewLayout, onActiveTabChange, saveCurrentLayout, syncTabsToDockview],
  );

  const splitEditor = React.useCallback((direction: "right" | "below", referencePanelId?: string) => {
    const api = apiRef.current;
    if (!api) return;
    const referencePanel = referencePanelId ? api.getPanel(referencePanelId) : api.activePanel;
    referencePanel?.api.setActive();
    const referenceParams = referencePanel?.params as EditorPlaceholderParams | undefined;
    if (referenceParams?.kind === "file" && referenceParams.tab) {
      const splitId = `${referenceParams.tab.id}::split-${direction}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      api.addPanel<EditorPlaceholderParams>({
        id: splitId,
        title: tabTitle(referenceParams.tab),
        component: EDITOR_COMPONENT,
        params: filePanelParams(referenceParams.tab),
        position: referencePanel
          ? { referencePanel, direction }
          : { direction },
      });
      saveCurrentLayout();
      return;
    }
    const id = `split-${direction}-${Date.now()}`;
    api.addPanel<EditorPlaceholderParams>({
      id,
      title: direction === "right" ? "向右拆分" : "向下拆分",
      component: EDITOR_COMPONENT,
      params: {
        kind: "split-placeholder",
        title: direction === "right" ? "向右拆分" : "向下拆分",
        description:
          "已创建新的编辑器分组。请从资源管理器打开文件，或从已有标签页右键拆分。",
      },
      position: referencePanel
        ? { referencePanel, direction }
        : { direction },
    });
    saveCurrentLayout();
  }, [saveCurrentLayout]);

  const headerActions = React.useMemo(() => ({
    tabs,
    onRequestCloseTabs,
    onSplitEditor: splitEditor,
    preferences,
    onPreferencesChange: updatePreferences,
  }), [onRequestCloseTabs, preferences, splitEditor, tabs, updatePreferences]);

  return (
    <section className="grid min-h-0 min-w-0 bg-canvas" data-ide-editor-dock>
      <div className="tracevane-dockview min-h-0 min-w-0 bg-canvas" data-ide-dockview-host>
        <EditorDockCallbacksContext.Provider value={{ onDirtyChange, onSaveStateChange, onFileMetadataChange, preferences }}>
        <EditorDockHeaderActionsContext.Provider value={headerActions}>
        <DockviewReact
          className="dockview-theme-light tracevane-dockview-instance h-full w-full"
          components={{ [EDITOR_COMPONENT]: EditorPlaceholderPanel }}
          watermarkComponent={EditorDockWatermark}
          defaultTabComponent={(props) => (
            <EditorDockTab {...props} tabs={tabs} gitDecorations={gitDecorations} onPinTab={onPinTab} onRequestCloseTabs={onRequestCloseTabs} onSplitEditor={splitEditor} />
          )}
          rightHeaderActionsComponent={EditorDockHeaderActionsAdapter}
          onReady={handleReady}
        />
        </EditorDockHeaderActionsContext.Provider>
        </EditorDockCallbacksContext.Provider>
      </div>
    </section>
  );
}

function EditorDockHeaderActionsAdapter(props: IDockviewHeaderActionsProps) {
  const context = React.useContext(EditorDockHeaderActionsContext);
  if (!context) return null;
  return <EditorDockHeaderActions {...props} {...context} />;
}

function EditorDockWatermark(_props: IWatermarkPanelProps) {
  return (
    <EmptyState
      className="h-full bg-canvas"
      icon={<FileText />}
      title="未打开文件"
      description="从左侧资源管理器选择一个文件开始编辑或预览。已打开文件会保留在上方标签页，并随工作区布局一起恢复。"
      data-ide-editor-watermark
    />
  );
}


function EditorDockHeaderActions({
  activePanel,
  tabs,
  onRequestCloseTabs,
  onSplitEditor,
  preferences,
  onPreferencesChange,
}: IDockviewHeaderActionsProps & {
  tabs: readonly IdeWorkbenchEditorTab[];
  onRequestCloseTabs: (tabIds: string[]) => void;
  onSplitEditor: (direction: "right" | "below", referencePanelId?: string) => void;
  preferences: IdeEditorPreferences;
  onPreferencesChange: (patch: Partial<IdeEditorPreferences>) => void;
}) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const activeTab = (activePanel?.params as EditorPlaceholderParams | undefined)?.tab;

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const runMenuAction = React.useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  const closeSavedIds = React.useMemo(
    () => tabs.filter((item) => !item.dirty && item.saveState !== "saving").map((item) => item.id),
    [tabs],
  );

  const toggleMenu = React.useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    const menuWidth = 256;
    setMenuPosition({
      left: Math.max(8, Math.min((rect?.right ?? menuWidth) - menuWidth, window.innerWidth - menuWidth - 8)),
      top: Math.min((rect?.bottom ?? 0) + 6, window.innerHeight - 16),
    });
    setOpen(true);
  }, [open]);

  return (
    <div className="relative flex h-full shrink-0 items-center border-l border-line bg-panel px-1" data-ide-editor-action-menu-host>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-panel-2 px-2 text-xs font-medium text-ink outline-none hover:border-primary-line hover:bg-primary-soft focus-visible:shadow-[var(--ring)]"
        aria-label="打开编辑器操作菜单"
        aria-expanded={open ? "true" : "false"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleMenu();
        }}
        data-ide-editor-action-menu-trigger
      >
        <MoreHorizontal className="size-4" aria-hidden />
        <span className="hidden sm:inline">操作</span>
      </button>

      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[1000] w-64 rounded-lg border border-line bg-panel p-2 text-sm text-ink shadow-lg"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onPointerDown={(event) => event.stopPropagation()}
          data-ide-editor-action-menu
        >
          <div className="px-2 pb-2 text-xs font-semibold text-ink-strong">编辑器操作</div>
          <EditorTabMenuButton
            icon={<Save />}
            label="保存当前"
            shortcut="Ctrl S"
            onClick={() => activeTab && runMenuAction(() => { void saveIdeEditorTab(activeTab.id); })}
            dataAttr="action-save-current"
            disabled={!activeTab || activeTab.deleted || activeTab.saveState === "saving" || !activeTab.dirty}
          />
          <EditorTabMenuButton
            icon={<CheckCheck />}
            label="关闭已保存"
            onClick={() => runMenuAction(() => onRequestCloseTabs(closeSavedIds))}
            dataAttr="action-close-saved"
            disabled={closeSavedIds.length === 0}
          />
          <EditorTabMenuButton
            icon={<X />}
            label="关闭当前"
            onClick={() => activeTab && runMenuAction(() => onRequestCloseTabs([activeTab.id]))}
            dataAttr="action-close-current"
            disabled={!activeTab}
          />
          <EditorTabMenuButton
            icon={<X />}
            label="关闭其他"
            onClick={() => activeTab && runMenuAction(() => onRequestCloseTabs(tabs.filter((item) => item.id !== activeTab.id).map((item) => item.id)))}
            dataAttr="action-close-others"
            disabled={!activeTab || tabs.length <= 1}
          />
          <EditorTabMenuButton
            icon={<X />}
            label="关闭全部"
            onClick={() => runMenuAction(() => onRequestCloseTabs(tabs.map((item) => item.id)))}
            dataAttr="action-close-all"
            disabled={tabs.length === 0}
          />

          <div className="my-1 border-t border-line" />
          <EditorTabMenuButton
            icon={<TextCursorInput />}
            label="重命名符号"
            shortcut="F2"
            onClick={() => activeTab && runMenuAction(() => runIdeEditorAction(activeTab.id, "editor.action.rename"))}
            dataAttr="action-lsp-rename"
            disabled={!activeTab || activeTab.deleted}
          />
          <EditorTabMenuButton
            icon={<Sparkles />}
            label="格式化文档"
            shortcut="Shift Alt F"
            onClick={() => activeTab && runMenuAction(() => runIdeEditorAction(activeTab.id, "editor.action.formatDocument"))}
            dataAttr="action-lsp-format"
            disabled={!activeTab || activeTab.deleted}
          />
          <EditorTabMenuButton
            icon={<Code2 />}
            label="代码操作"
            shortcut="Ctrl ."
            onClick={() => activeTab && runMenuAction(() => runIdeEditorAction(activeTab.id, "editor.action.quickFix"))}
            dataAttr="action-lsp-code-action"
            disabled={!activeTab || activeTab.deleted}
          />
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={preferences.minimapEnabled ? "true" : "false"}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)]"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPreferencesChange({ minimapEnabled: !preferences.minimapEnabled });
            }}
            data-ide-editor-action-minimap
          >
            <span className={cn("grid size-3.5 place-items-center rounded border border-line", preferences.minimapEnabled ? "bg-primary text-primary-contrast" : "bg-panel-2 text-transparent")}>✓</span>
            <span className="min-w-0 flex-1 truncate">小地图</span>
          </button>
          <div className="my-1 border-t border-line" />
          <EditorTabMenuButton
            icon={<SplitSquareHorizontal />}
            label="向右拆分"
            onClick={() => runMenuAction(() => onSplitEditor("right", activePanel?.id))}
            dataAttr="action-split-right"
            disabled={!activePanel}
          />
          <EditorTabMenuButton
            icon={<SplitSquareVertical />}
            label="向下拆分"
            onClick={() => runMenuAction(() => onSplitEditor("below", activePanel?.id))}
            dataAttr="action-split-down"
            disabled={!activePanel}
          />
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function EditorDockTab({
  api,
  params,
  tabs,
  gitDecorations,
  onPinTab,
  onRequestCloseTabs,
  onSplitEditor,
}: IDockviewPanelHeaderProps<EditorPlaceholderParams> & {
  tabs: readonly IdeWorkbenchEditorTab[];
  gitDecorations?: ReadonlyMap<string, IdeGitDecoration>;
  onPinTab: (tabId: string) => void;
  onRequestCloseTabs: (tabIds: string[]) => void;
  onSplitEditor: (direction: "right" | "below", referencePanelId?: string) => void;
}) {
  const tab = params.tab;
  const isGitDiff = params.kind === "git-diff" || tab?.mode === "git-diff";
  const title = tabTitle(tab) || params.title || "Editor";
  const tabIndex = tab ? tabs.findIndex((item) => item.id === tab.id) : -1;
  const gitDecoration = tab ? gitDecorations?.get(tab.ref.path) : undefined;
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  const runMenuAction = React.useCallback((action: () => void) => {
    action();
    setMenu(null);
  }, []);

  return (
    <>
      <div
        role="tab"
        aria-selected={api.isActive ? "true" : "false"}
        className="group/ide-editor-tab flex h-full min-w-[7.5rem] max-w-[14rem] flex-[1_1_10rem] items-center gap-1.5 px-2 text-sm text-ink outline-none focus-within:shadow-[var(--ring)]"
        title={tab?.ref.path ?? title}
        onClick={() => api.setActive()}
        onDoubleClick={() => tab && onPinTab(tab.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          api.setActive();
          setMenu(clampTabMenuPoint(event.clientX, event.clientY));
        }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            event.stopPropagation();
            api.setActive();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu(clampTabMenuPoint(rect.left + 12, rect.bottom + 4));
          }
        }}
        tabIndex={0}
        data-ide-editor-tab
        data-ide-editor-tab-id={tab?.id ?? api.id}
        data-ide-editor-tab-path={tab?.ref.path ?? ""}
        data-ide-editor-tab-dirty={tab?.dirty ? "true" : "false"}
        data-ide-editor-tab-save-state={tab?.saveState ?? (tab?.dirty ? "dirty" : "clean")}
        data-ide-editor-tab-external-state={tab?.externalState ?? "none"}
      >
        {tab?.preview && !tab.pinned ? (
          <Eye className="size-3.5 shrink-0 text-subtle" aria-label="预览标签" data-ide-editor-tab-preview-icon />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {gitDecoration && !gitDecoration.aggregate ? (
          <span
            className={cn(
              "grid min-w-4 shrink-0 place-items-center rounded border px-1 py-0.5 text-[10px] font-semibold leading-none",
              gitDecoration.tone === "added" && "border-success/40 bg-success/10 text-success",
              gitDecoration.tone === "modified" && "border-warning/40 bg-warning-soft text-warning",
              gitDecoration.tone === "deleted" && "border-danger-line bg-danger-soft text-danger",
              gitDecoration.tone === "renamed" && "border-primary-line bg-primary-soft text-primary",
              gitDecoration.tone === "untracked" && "border-primary-line bg-primary-soft text-primary",
              gitDecoration.tone === "conflicted" && "border-danger-line bg-danger-soft text-danger",
              gitDecoration.tone === "unknown" && "border-line bg-panel-2 text-muted",
            )}
            title={`Git: ${gitDecoration.kind}`}
            data-ide-editor-tab-git-decoration
          >
            {gitDecoration.label}
          </span>
        ) : null}
        {tab?.dirty ? <span className="shrink-0 text-warning" aria-label="未保存修改">●</span> : null}
        {tab ? (
          <button
            type="button"
            className="grid size-5 shrink-0 place-items-center rounded-sm text-subtle opacity-70 outline-none hover:bg-panel hover:text-ink focus-visible:opacity-100 focus-visible:shadow-[var(--ring)] group-hover/ide-editor-tab:opacity-100"
            aria-label={`关闭 ${tab.title}`}
            title="关闭标签"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestCloseTabs([tab.id]);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            data-ide-editor-tab-close
          >
            <X className="size-3" />
          </button>
        ) : null}
        <span className="sr-only">{api.title ?? title}</span>
      </div>
      {menu ? createPortal(
        <div
          role="menu"
          className="fixed z-[1000] min-w-56 rounded-lg border border-line bg-panel p-1 text-sm text-ink shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          data-ide-editor-tab-context-menu
          data-ide-editor-tab-id={tab?.id ?? api.id}
        >
          {tab ? (
            <>
              <EditorTabMenuButton
                icon={<Save />}
                label="保存"
                shortcut="Ctrl S"
                onClick={() => runMenuAction(() => { void saveIdeEditorTab(tab.id); })}
                dataAttr="save"
                disabled={isGitDiff || tab.deleted || tab.saveState === "saving" || !tab.dirty}
              />
              <EditorTabMenuButton
                icon={<X />}
                label="关闭"
                shortcut="Ctrl F4"
                onClick={() => runMenuAction(() => onRequestCloseTabs([tab.id]))}
                dataAttr="close"
              />
              <EditorTabMenuButton
                icon={<X />}
                label="关闭其他"
                onClick={() => runMenuAction(() => onRequestCloseTabs(tabs.filter((item) => item.id !== tab.id).map((item) => item.id)))}
                dataAttr="close-others"
                disabled={tabs.length <= 1}
              />
              <EditorTabMenuButton
                icon={<X />}
                label="关闭右侧标签页"
                onClick={() => runMenuAction(() => onRequestCloseTabs(tabs.slice(tabIndex + 1).map((item) => item.id)))}
                dataAttr="close-right"
                disabled={tabIndex < 0 || tabIndex >= tabs.length - 1}
              />
              <EditorTabMenuButton
                icon={<CheckCheck />}
                label="关闭已保存"
                onClick={() => runMenuAction(() => onRequestCloseTabs(tabs.filter((item) => !item.dirty && item.saveState !== "saving").map((item) => item.id)))}
                dataAttr="close-saved"
                disabled={!tabs.some((item) => !item.dirty && item.saveState !== "saving")}
              />
              <EditorTabMenuButton
                icon={<X />}
                label="关闭全部"
                onClick={() => runMenuAction(() => onRequestCloseTabs(tabs.map((item) => item.id)))}
                dataAttr="close-all"
              />
              <div className="my-1 border-t border-line" />
              <EditorTabMenuButton
                icon={<Copy />}
                label="复制路径"
                onClick={() => runMenuAction(() => { void copyText(tab.ref.path, "已复制路径"); })}
                dataAttr="copy-path"
              />
              <EditorTabMenuButton
                icon={<Copy />}
                label="复制相对路径"
                onClick={() => runMenuAction(() => { void copyText(tab.ref.path, "已复制相对路径"); })}
                dataAttr="copy-relative-path"
              />
              <div className="my-1 border-t border-line" />
              <EditorTabMenuButton
                icon={<Pin />}
                label="固定标签"
                onClick={() => runMenuAction(() => onPinTab(tab.id))}
                dataAttr="pin"
                disabled={tab.pinned}
              />
            </>
          ) : null}
          <div className="my-1 border-t border-line" />
          <EditorTabMenuButton
            icon={<SplitSquareHorizontal />}
            label="向右拆分"
            onClick={() => runMenuAction(() => onSplitEditor("right", api.id))}
            dataAttr="split-right"
          />
          <EditorTabMenuButton
            icon={<SplitSquareVertical />}
            label="向下拆分"
            onClick={() => runMenuAction(() => onSplitEditor("below", api.id))}
            dataAttr="split-down"
          />
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function EditorTabMenuButton({
  icon,
  label,
  onClick,
  dataAttr,
  disabled = false,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  dataAttr: string;
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:text-disabled [&_svg]:size-3.5"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      data-ide-editor-tab-menu-item={dataAttr}
      data-ide-editor-split-right={dataAttr === "split-right" ? "true" : undefined}
      data-ide-editor-split-down={dataAttr === "split-down" ? "true" : undefined}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? <span className="rounded border border-line bg-panel-2 px-1 font-mono text-2xs text-subtle">{shortcut}</span> : null}
    </button>
  );
}

function clampTabMenuPoint(x: number, y: number): { x: number; y: number } {
  const menuWidth = 232;
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - menuWidth)),
    y: Math.max(8, y),
  };
}

function filePanelParams(
  tab: IdeWorkbenchEditorTab,
): EditorPlaceholderParams {
  if (tab.mode === "git-diff") {
    return {
      kind: "git-diff",
      tab,
      title: tab.title,
      description: "Git diff 只显示当前文件差异；暂存、取消暂存和提交请在 Source Control 中完成。",
    };
  }
  return {
    kind: "file",
    tab,
    title: tab.title,
    description:
      "该文件已在编辑器中打开。内容读写由文件服务负责，布局只保存窗口和标签状态。",
  };
}

function editorPanelTabId(panel: { id: string; params?: unknown }): string | null {
  const params = panel.params as EditorPlaceholderParams | undefined;
  if ((params?.kind === "file" || params?.kind === "git-diff") && params.tab?.id) return params.tab.id;
  return params?.kind === "file" || params?.kind === "git-diff" ? null : panel.id;
}

async function copyText(text: string, successTitle: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
    toast.success(successTitle, { description: text });
  } catch (error) {
    toast.error("复制失败", { description: error instanceof Error ? error.message : String(error) });
  }
}

function tabTitle(tab?: IdeWorkbenchEditorTab): string {
  if (!tab) return "";
  const external = tab.externalState ? ` (${tab.externalState})` : "";
  const prefix = tab.mode === "git-diff" ? "⇄ " : "";
  return `${tab.dirty ? "● " : ""}${prefix}${tab.title}${tab.deleted ? " (deleted)" : external}`;
}
