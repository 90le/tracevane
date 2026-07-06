import * as React from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { FileText, SplitSquareHorizontal, SplitSquareVertical } from "lucide-react";

import { cn } from "@/design/lib/utils";
import type { IdeWorkbenchEditorTab } from "../types";
import type { EditorSaveState } from "@/shared/editor-core";
import { IdeEditorFilePanel } from "./IdeEditorFilePanel";
import { GitDiffEditorPanel } from "../git/GitDiffEditorPanel";
import type { IdeEditorPreferences } from "./editorPreferences";
import type { IdeWorkbenchEditorFileMetadata } from "../types";

export interface EditorPlaceholderParams {
  kind: "file" | "git-diff" | "split-placeholder";
  tab?: IdeWorkbenchEditorTab;
  title: string;
  description: string;
}

export const EditorDockCallbacksContext = React.createContext<{
  onDirtyChange: (tabId: string, dirty: boolean) => void;
  onSaveStateChange: (tabId: string, saveState: EditorSaveState, message?: string | null) => void;
  onFileMetadataChange: (tabId: string, metadata: IdeWorkbenchEditorFileMetadata) => void;
  preferences: IdeEditorPreferences;
}>({
  onDirtyChange: () => undefined,
  onSaveStateChange: () => undefined,
  onFileMetadataChange: () => undefined,
  preferences: { minimapEnabled: false },
});

export function EditorPlaceholderPanel({
  params,
}: IDockviewPanelProps<EditorPlaceholderParams>) {
  const isFile = params.kind === "file";
  const callbacks = React.useContext(EditorDockCallbacksContext);
  if (isFile && params.tab) {
    return (
      <IdeEditorFilePanel
        tab={params.tab}
        preferences={callbacks.preferences}
        onDirtyChange={callbacks.onDirtyChange}
        onSaveStateChange={callbacks.onSaveStateChange}
        onFileMetadataChange={callbacks.onFileMetadataChange}
      />
    );
  }
  if (params.kind === "git-diff" && params.tab) {
    return <GitDiffEditorPanel tab={params.tab} />;
  }
  return (
    <div className="grid h-full min-h-0 place-items-center bg-canvas p-6 text-ink" data-ide-editor-panel data-ide-editor-panel-kind={params.kind}>
      <div className="max-w-xl rounded-lg border border-line bg-panel p-5 text-center shadow-sm">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-md bg-primary-soft text-primary">
          {isFile ? (
            <FileText className="size-5" />
          ) : params.title.includes("Down") || params.title.includes("下") ? (
            <SplitSquareVertical className="size-5" />
          ) : (
            <SplitSquareHorizontal className="size-5" />
          )}
        </div>
        <div className="text-sm font-semibold text-ink-strong" data-ide-editor-panel-title>
          {params.title}
        </div>
        <div className="mt-2 text-sm text-muted">{params.description}</div>
        {params.tab ? (
          <div className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-left font-mono text-2xs text-subtle">
            <div className="truncate">root: {params.tab.ref.rootId}</div>
            <div className="truncate" data-ide-editor-panel-path>path: {params.tab.ref.path}</div>
            <div className="truncate">
              mode: {params.tab.preview ? "preview" : "pinned"}
              {params.tab.dirty ? " · dirty" : ""}
              {params.tab.deleted ? " · deleted" : ""}
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            "mt-3 rounded-full border border-line bg-panel-2 px-3 py-1 text-2xs text-subtle",
            "inline-flex items-center justify-center",
          )}
        >
          IDE editor placeholder
        </div>
      </div>
    </div>
  );
}
