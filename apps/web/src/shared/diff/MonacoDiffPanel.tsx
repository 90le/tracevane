import * as React from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";

import { useTheme } from "@/app/providers";
import { cn } from "@/design/lib/utils";

export interface MonacoDiffPanelProps {
  original: string;
  modified: string;
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  className?: string;
}

export function MonacoDiffPanel({
  original,
  modified,
  language = "plaintext",
  originalLabel = "磁盘版本",
  modifiedLabel = "当前编辑器",
  className,
}: MonacoDiffPanelProps) {
  const { theme } = useTheme();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const diffEditorRef = React.useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = React.useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = React.useRef<monaco.editor.ITextModel | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const originalModel = monaco.editor.createModel(original, language || "plaintext");
    const modifiedModel = monaco.editor.createModel(modified, language || "plaintext");
    const diffEditor = monaco.editor.createDiffEditor(container, {
      automaticLayout: true,
      contextmenu: true,
      diffWordWrap: "on",
      enableSplitViewResizing: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontLigatures: true,
      fontSize: 13,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false },
      originalEditable: false,
      readOnly: true,
      renderOverviewRuler: true,
      renderSideBySide: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      theme: theme === "dark" ? "vs-dark" : "vs",
      wordWrap: "on",
    });
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    diffEditorRef.current = diffEditor;
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;
    const frame = requestAnimationFrame(() => diffEditor.layout());

    return () => {
      cancelAnimationFrame(frame);
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      diffEditorRef.current = null;
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
  }, [language, modified, original, theme]);

  React.useEffect(() => {
    const monacoTheme = theme === "dark" ? "vs-dark" : "vs";
    monaco.editor.setTheme(monacoTheme);
    requestAnimationFrame(() => diffEditorRef.current?.layout());
  }, [theme]);

  return (
    <div className={cn("grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-line bg-panel", className)} data-monaco-diff-panel>
      <div className="grid grid-cols-2 border-b border-line bg-panel-2 text-xs font-medium text-muted">
        <div className="truncate border-r border-line px-3 py-2" data-monaco-diff-original-label>{originalLabel}</div>
        <div className="truncate px-3 py-2" data-monaco-diff-modified-label>{modifiedLabel}</div>
      </div>
      <div ref={containerRef} className="min-h-0 min-w-0" data-monaco-diff-container />
    </div>
  );
}
