import "dockview-react/dist/styles/dockview.css";
import "./EditorDock.css";

import * as React from "react";
import type {
  DockviewApi,
  DockviewReadyEvent,
  IDockviewPanelHeaderProps,
  IWatermarkPanelProps,
  SerializedDockview,
} from "dockview-react";
import { DockviewReact } from "dockview-react";
import { CheckCheck, Copy, Pin, Save, SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";

import { toast } from "@/design/ui/sonner";
import type { EditorSaveState } from "@/shared/editor-core";
import type { IdeWorkbenchEditorTab } from "../types";
import { saveIdeEditorTab } from "./ideEditorRuntime";
import { EditorDockCallbacksContext, EditorPlaceholderPanel, type EditorPlaceholderParams } from "./EditorPlaceholderPanel";

export interface EditorDockProps {
  tabs: readonly IdeWorkbenchEditorTab[];
  activeTabId: string | null;
  dockviewLayout: SerializedDockview | null;
  onDockviewLayoutChange: (layout: SerializedDockview | null) => void;
  onActiveTabChange: (tabId: string | null) => void;
  onPinTab: (tabId: string) => void;
  onDirtyChange: (tabId: string, dirty: boolean) => void;
  onSaveStateChange: (tabId: string, saveState: EditorSaveState, message?: string | null) => void;
  onRequestCloseTabs: (tabIds: string[]) => void;
}

const EDITOR_COMPONENT = "tracevane.editor.placeholder";

export function EditorDock({
  tabs,
  activeTabId,
  dockviewLayout,
  onDockviewLayoutChange,
  onActiveTabChange,
  onPinTab,
  onDirtyChange,
  onSaveStateChange,
  onRequestCloseTabs,
}: EditorDockProps) {
  const apiRef = React.useRef<DockviewApi | null>(null);
  const disposablesRef = React.useRef<Array<{ dispose: () => void }>>([]);
  const restoredRef = React.useRef(false);
  const saveLayoutRef = React.useRef(onDockviewLayoutChange);
  const tabsRef = React.useRef(tabs);

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
      if (panel.params?.kind === "file" && !tabIds.has(panel.id)) {
        api.removePanel(panel);
      }
    }
    for (const tab of tabsRef.current) {
      const params = filePanelParams(tab);
      const existing = api.getPanel(tab.id);
      if (existing) {
        existing.setTitle(tabTitle(tab));
        existing.update({ params });
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
    api.getPanel(activeTabId)?.api.setActive();
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
      if (activeTabId) event.api.getPanel(activeTabId)?.api.setActive();

      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [
        event.api.onDidLayoutChange(() => saveCurrentLayout()),
        event.api.onDidActivePanelChange((change) => {
          const nextId = change.panel?.id ?? null;
          onActiveTabChange(nextId && tabsRef.current.some((tab) => tab.id === nextId) ? nextId : null);
        }),
        event.api.onDidRemovePanel((panel) => {
          if (panel.id === activeTabId) {
            const nextId = event.api.activePanel?.id ?? null;
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
    const id = `split-${direction}-${Date.now()}`;
    api.addPanel<EditorPlaceholderParams>({
      id,
      title: direction === "right" ? "Split Right" : "Split Down",
      component: EDITOR_COMPONENT,
      params: {
        kind: "split-placeholder",
        title: direction === "right" ? "Split Right 占位" : "Split Down 占位",
        description:
          "M5.y-C 继续保留 Dockview 分裂占位；真实多编辑组内容共享与完整拖拽进入 M5.y-D。",
      },
      position: referencePanel
        ? { referencePanel, direction }
        : { direction },
    });
    saveCurrentLayout();
  }, [saveCurrentLayout]);

  return (
    <section className="grid min-h-0 min-w-0 bg-canvas" data-ide-editor-dock>
      <div className="tracevane-dockview min-h-0 min-w-0 bg-canvas" data-ide-dockview-host>
        <EditorDockCallbacksContext.Provider value={{ onDirtyChange, onSaveStateChange }}>
        <DockviewReact
          className="dockview-theme-light tracevane-dockview-instance h-full w-full"
          components={{ [EDITOR_COMPONENT]: EditorPlaceholderPanel }}
          watermarkComponent={EditorDockWatermark}
          defaultTabComponent={(props) => (
            <EditorDockTab {...props} tabs={tabs} onPinTab={onPinTab} onRequestCloseTabs={onRequestCloseTabs} onSplitEditor={splitEditor} />
          )}
          onReady={handleReady}
        />
        </EditorDockCallbacksContext.Provider>
      </div>
    </section>
  );
}

function EditorDockWatermark(_props: IWatermarkPanelProps) {
  return (
    <div className="grid h-full place-items-center bg-canvas p-6 text-center text-sm text-muted" data-ide-editor-watermark>
      <div className="max-w-md rounded-lg border border-dashed border-line bg-panel px-5 py-4">
        <div className="font-semibold text-ink-strong">IDE Editor Dock</div>
        <div className="mt-2">
          从左侧 Explorer 打开文件。编辑器组拆分入口位于标签页右键菜单；M5.y-C 支持 Monaco dirty/save 与关闭保护。
        </div>
      </div>
    </div>
  );
}

function EditorDockTab({
  api,
  params,
  tabs,
  onPinTab,
  onRequestCloseTabs,
  onSplitEditor,
}: IDockviewPanelHeaderProps<EditorPlaceholderParams> & {
  tabs: readonly IdeWorkbenchEditorTab[];
  onPinTab: (tabId: string) => void;
  onRequestCloseTabs: (tabIds: string[]) => void;
  onSplitEditor: (direction: "right" | "below", referencePanelId?: string) => void;
}) {
  const tab = params.tab;
  const title = tabTitle(tab) || params.title || "Editor";
  const modeLabel = tab?.pinned ? "pinned" : tab?.preview ? "preview" : "placeholder";
  const tabIndex = tab ? tabs.findIndex((item) => item.id === tab.id) : -1;
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
      <button
        type="button"
        className="flex h-full min-w-0 items-center gap-1.5 px-2 text-sm text-ink outline-none focus-visible:shadow-[var(--ring)]"
        title={tab?.ref.path ?? title}
        onClick={() => api.setActive()}
        onDoubleClick={() => tab && onPinTab(tab.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          api.setActive();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        data-ide-editor-tab
        data-ide-editor-tab-id={tab?.id ?? api.id}
        data-ide-editor-tab-path={tab?.ref.path ?? ""}
        data-ide-editor-tab-dirty={tab?.dirty ? "true" : "false"}
        data-ide-editor-tab-save-state={tab?.saveState ?? (tab?.dirty ? "dirty" : "clean")}
      >
        <span className="min-w-0 truncate">{title}</span>
        <span className="rounded border border-line bg-panel-2 px-1 font-mono text-2xs text-subtle">
          {modeLabel}
        </span>
        {tab?.dirty ? <span className="text-amber">●</span> : null}
        <span className="sr-only">{api.title ?? title}</span>
      </button>
      {menu ? (
        <div
          role="menu"
          className="fixed z-50 min-w-56 rounded-md border border-line bg-panel p-1 text-sm text-ink shadow-lg"
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
                disabled={tab.deleted || tab.saveState === "saving" || !tab.dirty}
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
                label="全部关闭"
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
        </div>
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

function filePanelParams(
  tab: IdeWorkbenchEditorTab,
): EditorPlaceholderParams {
  return {
    kind: "file",
    tab,
    title: tab.title,
    description:
      "M5.y-C 已将该文件打开到 Dockview editor panel；Monaco 内容由 editor-core/Files API 负责读写，Dockview 只保存布局 metadata。",
  };
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
  return `${tab.dirty ? "● " : ""}${tab.title}${tab.deleted ? " (deleted)" : ""}`;
}
