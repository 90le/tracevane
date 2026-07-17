import * as React from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { SplitSquareHorizontal, SplitSquareVertical } from "lucide-react";

import { EmptyState } from "@/design/ui/state";
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
  const callbacks = React.useContext(EditorDockCallbacksContext);
  if (params.kind === "file" && params.tab) {
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
    <EmptyState
      className="h-full min-h-0 bg-canvas"
      icon={params.title.includes("向下") ? <SplitSquareVertical /> : <SplitSquareHorizontal />}
      title={params.title}
      description={params.description}
      data-ide-editor-panel
      data-ide-editor-panel-kind={params.kind}
      data-ide-editor-panel-title={params.title}
    />
  );
}
