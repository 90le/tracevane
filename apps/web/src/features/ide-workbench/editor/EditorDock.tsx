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
import { SplitSquareHorizontal, SplitSquareVertical } from "lucide-react";

import { Button } from "@/design/ui/button";
import type { IdeWorkbenchEditorTab } from "../types";
import { EditorPlaceholderPanel, type EditorPlaceholderParams } from "./EditorPlaceholderPanel";

export interface EditorDockProps {
  tabs: readonly IdeWorkbenchEditorTab[];
  activeTabId: string | null;
  dockviewLayout: SerializedDockview | null;
  onDockviewLayoutChange: (layout: SerializedDockview | null) => void;
  onActiveTabChange: (tabId: string | null) => void;
  onPinTab: (tabId: string) => void;
}

const EDITOR_COMPONENT = "tracevane.editor.placeholder";

export function EditorDock({
  tabs,
  activeTabId,
  dockviewLayout,
  onDockviewLayoutChange,
  onActiveTabChange,
  onPinTab,
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

  const splitEditor = React.useCallback((direction: "right" | "below") => {
    const api = apiRef.current;
    if (!api) return;
    const activePanel = api.activePanel;
    const id = `split-${direction}-${Date.now()}`;
    api.addPanel<EditorPlaceholderParams>({
      id,
      title: direction === "right" ? "Split Right" : "Split Down",
      component: EDITOR_COMPONENT,
      params: {
        kind: "split-placeholder",
        title: direction === "right" ? "Split Right 占位" : "Split Down 占位",
        description:
          "M4-B 仅验证 Dockview editor group 分裂与布局持久化；真实 Monaco 编辑组、保存和模型共享进入后续阶段。",
      },
      position: activePanel
        ? { referencePanel: activePanel, direction }
        : { direction },
    });
    saveCurrentLayout();
  }, [saveCurrentLayout]);

  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-canvas" data-ide-editor-dock>
      <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-line bg-panel px-2">
        <div className="min-w-0 flex-1 truncate text-sm text-subtle">
          Editor Dock · Dockview-backed placeholder
        </div>
        <Button variant="ghost" size="sm" onClick={() => splitEditor("right")} data-ide-editor-split-right>
          <SplitSquareHorizontal />
          Split Right
        </Button>
        <Button variant="ghost" size="sm" onClick={() => splitEditor("below")} data-ide-editor-split-down>
          <SplitSquareVertical />
          Split Down
        </Button>
      </div>
      <div className="tracevane-dockview min-h-0 min-w-0 bg-canvas" data-ide-dockview-host>
        <DockviewReact
          className="dockview-theme-light tracevane-dockview-instance h-full w-full"
          components={{ [EDITOR_COMPONENT]: EditorPlaceholderPanel }}
          watermarkComponent={EditorDockWatermark}
          defaultTabComponent={(props) => (
            <EditorDockTab {...props} onPinTab={onPinTab} />
          )}
          onReady={handleReady}
        />
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
          从左侧 Explorer 打开文件，或使用 Split Right / Split Down 创建占位编辑组。
          M4-B 不接真实 Monaco 内容。
        </div>
      </div>
    </div>
  );
}

function EditorDockTab({
  api,
  params,
  onPinTab,
}: IDockviewPanelHeaderProps<EditorPlaceholderParams> & {
  onPinTab: (tabId: string) => void;
}) {
  const tab = params.tab;
  const title = tabTitle(tab) || params.title || "Editor";
  const modeLabel = tab?.pinned ? "pinned" : tab?.preview ? "preview" : "placeholder";
  return (
    <button
      type="button"
      className="flex h-full min-w-0 items-center gap-1.5 px-2 text-sm text-ink outline-none focus-visible:shadow-[var(--ring)]"
      title={tab?.ref.path ?? title}
      onDoubleClick={() => tab && onPinTab(tab.id)}
      data-ide-editor-tab
      data-ide-editor-tab-id={tab?.id ?? api.id}
      data-ide-editor-tab-path={tab?.ref.path ?? ""}
    >
      <span className="min-w-0 truncate">{title}</span>
      <span className="rounded border border-line bg-panel-2 px-1 font-mono text-2xs text-subtle">
        {modeLabel}
      </span>
      {tab?.dirty ? <span className="text-amber">●</span> : null}
      <span className="sr-only">{api.title ?? title}</span>
    </button>
  );
}

function filePanelParams(tab: IdeWorkbenchEditorTab): EditorPlaceholderParams {
  return {
    kind: "file",
    tab,
    title: tab.title,
    description:
      "M4-B 已将该文件打开到 Dockview editor panel；真实 Monaco model、读写保存、dirty/冲突处理后续接入 shared/editor-core 服务。",
  };
}

function tabTitle(tab?: IdeWorkbenchEditorTab): string {
  if (!tab) return "";
  return `${tab.dirty ? "● " : ""}${tab.title}${tab.deleted ? " (deleted)" : ""}`;
}
