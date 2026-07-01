import "monaco-editor/esm/nls.messages.zh-cn.js";
import * as React from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/editor/edcore.main.js";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

import { useTheme } from "@/app/providers";
import { cn } from "@/design/lib/utils";
import { MONACO_LANGUAGE_LOADERS } from "@/features/file-manager/code-editor/monacoLanguageLoaders";
import { editorModelUriPath } from "@/shared/editor-core/identity";
import { languageForPath } from "@/shared/editor-core/language";

configureMonacoWorkers();

const MONACO_KEYBOARD_CARET_GAP = 24;
const MONACO_KEYBOARD_MIN_OVERLAP = 8;
const MONACO_KEYBOARD_MAX_INSET_RATIO = 0.38;
const MONACO_KEYBOARD_MAX_SCROLL_DELTA = 96;

const monacoLanguageLoadCache = new Map<string, Promise<unknown>>();

export interface CodeEditorProps {
  path: string;
  rootId?: string;
  initialContent: string;
  readOnly?: boolean;
  profile?: CodeEditorProfile;
  fontSize?: number;
  minimapEnabled?: boolean;
  stickyScrollEnabled?: boolean;
  themeMode?: CodeEditorThemeMode;
  wordWrap?: CodeEditorWordWrap;
  onChange?: (value: string) => void;
  onSelectionChange?: (selection: CodeEditorSelectionContext | null) => void;
  onCursorPositionChange?: (position: CodeEditorCursorPosition | null) => void;
  className?: string;
}

export type CodeEditorThemeMode = "auto" | "light" | "dark";
export type CodeEditorProfile = "normal" | "large-readonly" | "mobile-basic";
export type CodeEditorWordWrap = "on" | "off";

export interface CodeEditorHandle {
  focus: () => void;
  runAction: (actionId: string) => void;
  openFind: () => void;
  openReplace: () => void;
  gotoLine: (line: number, column?: number) => void;
  saveViewState: () => CodeEditorViewState | null;
  restoreViewState: (viewState: CodeEditorViewState | null | undefined) => void;
  layout: () => void;
}

export type CodeEditorViewState = monaco.editor.ICodeEditorViewState;

export interface CodeEditorCursorPosition {
  lineNumber: number;
  column: number;
}

export interface CodeEditorSelectionContext {
  text: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    path,
    rootId,
    initialContent,
    readOnly = false,
    profile,
    fontSize = 13,
    minimapEnabled = false,
    stickyScrollEnabled = true,
    themeMode = "auto",
    wordWrap = "on",
    onChange,
    onSelectionChange,
    onCursorPositionChange,
    className,
  },
  ref,
) {
  const { theme } = useTheme();
  const effectiveTheme = themeMode === "auto" ? theme : themeMode;
  const editorProfile = profile ?? (readOnly ? "large-readonly" : "normal");
  const effectiveOptions = effectiveEditorOptions(editorProfile, {
    minimapEnabled,
    stickyScrollEnabled,
    wordWrap,
  });
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const modelRef = React.useRef<monaco.editor.ITextModel | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  const onCursorPositionChangeRef = React.useRef(onCursorPositionChange);
  const pendingKeyboardScrollDeltaRef = React.useRef(0);
  const [editorKeyboardInset, setEditorKeyboardInset] = React.useState(0);
  const [actionDiagnostics, setActionDiagnostics] = React.useState<MonacoActionDiagnostics>({
    count: 0,
    ids: [],
  });

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  React.useEffect(() => {
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  React.useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    runAction: (actionId) => runMonacoEditorAction(editorRef.current, actionId),
    openFind: () => runMonacoEditorAction(editorRef.current, "actions.find"),
    openReplace: () =>
      runMonacoEditorAction(
        editorRef.current,
        "editor.action.startFindReplaceAction",
      ),
    gotoLine: (line: number, column = 1) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      const safeLine = Math.max(1, Math.min(line, model?.getLineCount() ?? line));
      const safeColumn = Math.max(1, column);
      editor.setPosition({ lineNumber: safeLine, column: safeColumn });
      editor.revealPositionInCenter({ lineNumber: safeLine, column: safeColumn });
      editor.focus();
    },
    saveViewState: () => editorRef.current?.saveViewState() ?? null,
    restoreViewState: (viewState) => {
      const editor = editorRef.current;
      if (!editor || !viewState) return;
      try {
        editor.restoreViewState(viewState);
      } catch (error) {
        if (!isMonacoCancellation(error)) throw error;
      }
      requestAnimationFrame(() => editor.layout());
    },
    layout: () => editorRef.current?.layout(),
  }), []);

  const updateEditorKeyboardInset = React.useCallback(() => {
    const editor = editorRef.current;
    const container = containerRef.current;
    const viewport = window.visualViewport;
    if (!editor || !container || !viewport) {
      setEditorKeyboardInset(0);
      return;
    }

    const position = editor.getPosition();
    const caret = position ? editor.getScrolledVisiblePosition(position) : null;
    if (!caret) {
      setEditorKeyboardInset(0);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const visualBottom = Math.round(viewport.height + viewport.offsetTop);
    const visibleBottom = Math.min(
      Math.round(containerRect.bottom),
      visualBottom,
    );
    const viewportOverlap = Math.max(
      0,
      Math.round(containerRect.bottom - visibleBottom),
    );
    if (viewportOverlap <= MONACO_KEYBOARD_MIN_OVERLAP) {
      setEditorKeyboardInset(0);
      pendingKeyboardScrollDeltaRef.current = 0;
      return;
    }
    const caretBottom = Math.round(
      containerRect.top + caret.top + caret.height + MONACO_KEYBOARD_CARET_GAP,
    );
    const caretOverlap = Math.max(0, caretBottom - visibleBottom);
    const maxEditorInset = Math.round(
      containerRect.height * MONACO_KEYBOARD_MAX_INSET_RATIO,
    );
    // Do not blindly apply the full soft-keyboard overlap to Monaco. Mobile
    // browsers may already move/resize the visual viewport, and Monaco also
    // owns its own scroll model. Applying the whole keyboard height as padding
    // double-compensates and creates a blank strip before the first visible
    // line. Use only the measured intersection between this editor and the
    // current VisualViewport, then further cap it by the caret's real overlap.
    const nextInset =
      caretOverlap > MONACO_KEYBOARD_MIN_OVERLAP
        ? Math.min(viewportOverlap, caretOverlap, maxEditorInset)
        : 0;
    const remainingOverlap = Math.max(0, caretOverlap - nextInset);
    pendingKeyboardScrollDeltaRef.current =
      nextInset > 0 && editor.hasTextFocus()
        ? Math.min(remainingOverlap, MONACO_KEYBOARD_MAX_SCROLL_DELTA)
        : 0;
    setEditorKeyboardInset((previous) =>
      previous === nextInset ? previous : nextInset,
    );
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    const model = monaco.editor.createModel(
      initialContent,
      "plaintext",
      modelUriForPath(path, rootId),
    );
    const editor = monaco.editor.create(container, buildMonacoEditorOptions({
      model,
      fontSize,
      minimapEnabled,
      readOnly,
      profile: editorProfile,
      stickyScrollEnabled,
      theme: effectiveTheme === "dark" ? "vs-dark" : "vs",
      wordWrap,
    }));
    const cancelLanguageLoad = scheduleDeferredMonacoLanguageLoad(() => {
      const language = languageForPath(path);
      void ensureMonacoLanguage(language).then((loadedLanguage) => {
        if (disposed || model.isDisposed()) return;
        monaco.editor.setModelLanguage(model, loadedLanguage);
        requestAnimationFrame(() => editor.layout());
      });
    });
    editorRef.current = editor;
    modelRef.current = model;
    setActionDiagnostics(readMonacoActionDiagnostics(editor));
    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current?.(editor.getValue());
    });
    const cursorSubscription = editor.onDidChangeCursorPosition((event) => {
      onCursorPositionChangeRef.current?.({
        lineNumber: event.position.lineNumber,
        column: event.position.column,
      });
      window.requestAnimationFrame(updateEditorKeyboardInset);
    });
    onCursorPositionChangeRef.current?.(editor.getPosition());
    const selectionSubscription = editor.onDidChangeCursorSelection(() => {
      onSelectionChangeRef.current?.(readCodeEditorSelection(editor));
    });
    onSelectionChangeRef.current?.(readCodeEditorSelection(editor));
    const scrollSubscription = editor.onDidScrollChange(() => {
      window.requestAnimationFrame(updateEditorKeyboardInset);
    });
    const frame = requestAnimationFrame(() => editor.layout());

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelLanguageLoad();
      subscription.dispose();
      cursorSubscription.dispose();
      selectionSubscription.dispose();
      onSelectionChangeRef.current?.(null);
      onCursorPositionChangeRef.current?.(null);
      scrollSubscription.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
      setActionDiagnostics({ count: 0, ids: [] });
    };
    // Recreate the Monaco model only when the backing file changes. Content updates from typing are owned by Monaco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, rootId, updateEditorKeyboardInset]);

  React.useEffect(() => {
    const editor = editorRef.current;
    const model = modelRef.current;
    if (!editor || !model) return;
    if (model.getValue() !== initialContent) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: initialContent }],
        () => null,
      );
    }
    requestAnimationFrame(() => editor.layout());
  }, [initialContent]);

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateEditorKeyboardInset);
    };
    schedule();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    viewport.addEventListener("scrollend", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("focusin", schedule);
    window.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      viewport.removeEventListener("scrollend", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("focusin", schedule);
      window.removeEventListener("focusout", schedule);
    };
  }, [updateEditorKeyboardInset]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      padding: { top: 16, bottom: 16 + editorKeyboardInset },
    });
    const scrollTop = editor.getScrollTop();
    const scrollDelta = pendingKeyboardScrollDeltaRef.current;
    pendingKeyboardScrollDeltaRef.current = 0;
    window.requestAnimationFrame(() => {
      editor.layout();
      // Keep Monaco's scroll anchor stable while keyboard padding changes.
      // `revealPosition*` is intentionally avoided here because it may add an
      // extra top gap on mobile after the browser has already moved the visual
      // viewport. When the caret is truly covered, use only the measured overlap
      // as a small downward scroll delta after layout instead of recentering.
      editor.setScrollTop(Math.max(0, scrollTop + scrollDelta));
    });
  }, [editorKeyboardInset]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    monaco.editor.setTheme(effectiveTheme === "dark" ? "vs-dark" : "vs");
    editor.updateOptions({ theme: effectiveTheme === "dark" ? "vs-dark" : "vs" });
    requestAnimationFrame(() => editor.layout());
  }, [effectiveTheme]);

  React.useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly: readOnly || editorProfile === "large-readonly",
    });
  }, [readOnly, editorProfile]);

  React.useEffect(() => {
    editorRef.current?.updateOptions(
      editorRuntimeOptionsForProfile(editorProfile, {
        minimapEnabled,
        stickyScrollEnabled,
        wordWrap,
      }),
    );
    requestAnimationFrame(() => editorRef.current?.layout());
  }, [editorProfile, minimapEnabled, stickyScrollEnabled, wordWrap]);

  React.useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
    requestAnimationFrame(() => editorRef.current?.layout());
  }, [fontSize]);

  return (
    <div
      className={cn(
        "group/editor relative min-h-0 min-w-0 overflow-hidden",
        theme === "dark" ? "bg-[#1e1e1e]" : "bg-white",
        className,
      )}
      data-path={path}
      data-editor-language={languageForPath(path)}
      data-editor-theme={theme === "dark" ? "vs-dark" : "vs"}
      data-code-editor="monaco-direct"
      data-editor-shortcuts="ignore"
      data-code-editor-keyboard-inset={
        editorKeyboardInset > 0 ? "true" : "false"
      }
      data-code-editor-minimap={effectiveOptions.minimapEnabled ? "enabled" : "disabled"}
      data-code-editor-sticky-scroll={effectiveOptions.stickyScrollEnabled ? "enabled" : "disabled"}
      data-code-editor-word-wrap={effectiveOptions.wordWrap}
      data-code-editor-supported-action-count={actionDiagnostics.count}
      data-code-editor-supported-actions={actionDiagnostics.ids.join(",")}
    >
      <div
        ref={containerRef}
        className="w-full"
        data-code-editor-container
        style={{ height: "100%" }}
      />
    </div>
  );
});


interface MonacoActionDiagnostics {
  count: number;
  ids: string[];
}

const MONACO_DIAGNOSTIC_ACTION_IDS = [
  "actions.find",
  "editor.action.startFindReplaceAction",
  "editor.action.formatDocument",
  "editor.action.commentLine",
  "editor.action.quickCommand",
  "editor.action.marker.next",
  "editor.action.triggerSuggest",
] as const;

interface BuildMonacoEditorOptionsInput {
  model: monaco.editor.ITextModel;
  theme: "vs" | "vs-dark";
  fontSize: number;
  minimapEnabled: boolean;
  readOnly: boolean;
  profile: CodeEditorProfile;
  stickyScrollEnabled: boolean;
  wordWrap: CodeEditorWordWrap;
}

function buildMonacoEditorOptions({
  model,
  theme,
  fontSize,
  minimapEnabled,
  readOnly,
  profile,
  stickyScrollEnabled,
  wordWrap,
}: BuildMonacoEditorOptionsInput): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    model,
    ...editorRuntimeOptionsForProfile(profile, {
      minimapEnabled,
      stickyScrollEnabled,
      wordWrap,
    }),
    automaticLayout: true,
    bracketPairColorization: { enabled: true },
    contextmenu: true,
    cursorBlinking: "smooth",
    detectIndentation: true,
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: "never",
      loop: true,
      seedSearchStringFromSelection: "selection",
    },
    fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
    fontLigatures: true,
    fontSize,
    largeFileOptimizations: true,
    lineNumbers: "on",
    padding: { top: 16, bottom: 16 },
    readOnly: readOnly || profile === "large-readonly",
    renderLineHighlight: "all",
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    theme,
  };
}

interface CodeEditorOptionPreferences {
  minimapEnabled: boolean;
  stickyScrollEnabled: boolean;
  wordWrap: CodeEditorWordWrap;
}

function effectiveEditorOptions(
  profile: CodeEditorProfile,
  preferences: CodeEditorOptionPreferences,
): CodeEditorOptionPreferences {
  if (profile === "large-readonly") {
    return {
      minimapEnabled: false,
      stickyScrollEnabled: false,
      wordWrap: "off",
    };
  }
  if (profile === "mobile-basic") {
    return {
      minimapEnabled: false,
      stickyScrollEnabled: false,
      wordWrap: preferences.wordWrap,
    };
  }
  return preferences;
}

function editorRuntimeOptionsForProfile(
  profile: CodeEditorProfile,
  preferences: CodeEditorOptionPreferences,
): monaco.editor.IEditorOptions {
  const effectiveOptions = effectiveEditorOptions(profile, preferences);
  if (profile === "large-readonly") {
    return {
      codeLens: false,
      folding: false,
      glyphMargin: false,
      links: false,
      minimap: { enabled: effectiveOptions.minimapEnabled },
      occurrencesHighlight: "off",
      quickSuggestions: false,
      renderValidationDecorations: "off",
      selectionHighlight: false,
      stickyScroll: { enabled: effectiveOptions.stickyScrollEnabled },
      wordWrap: effectiveOptions.wordWrap,
    };
  }
  if (profile === "mobile-basic") {
    return {
      folding: false,
      glyphMargin: false,
      links: true,
      minimap: { enabled: effectiveOptions.minimapEnabled },
      quickSuggestions: false,
      stickyScroll: { enabled: effectiveOptions.stickyScrollEnabled },
      wordWrap: effectiveOptions.wordWrap,
    };
  }
  return {
    folding: true,
    links: true,
    minimap: { enabled: effectiveOptions.minimapEnabled },
    quickSuggestions: true,
    stickyScroll: { enabled: effectiveOptions.stickyScrollEnabled },
    wordWrap: effectiveOptions.wordWrap,
  };
}


function readMonacoActionDiagnostics(
  editor: monaco.editor.IStandaloneCodeEditor,
): MonacoActionDiagnostics {
  const supportedIds = editor
    .getSupportedActions()
    .map((action) => action.id)
    .filter((id): id is string => Boolean(id))
    .sort();
  const supportedIdSet = new Set(supportedIds);
  return {
    count: supportedIds.length,
    ids: MONACO_DIAGNOSTIC_ACTION_IDS.filter((id) => supportedIdSet.has(id)),
  };
}

function isMonacoCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "Canceled" || error.message === "Canceled";
}

function runMonacoEditorAction(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  actionId: string,
): void {
  if (!editor) return;
  editor.focus();
  void editor.getAction(actionId)?.run();
}

function readCodeEditorSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
): CodeEditorSelectionContext | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection || selection.isEmpty()) return null;
  const text = model.getValueInRange(selection);
  if (!text.trim()) return null;
  return {
    text,
    startLine: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLine: selection.endLineNumber,
    endColumn: selection.endColumn,
  };
}

function modelUriForPath(path: string, rootId?: string): monaco.Uri {
  return monaco.Uri.from({
    scheme: "file",
    path: rootId
      ? editorModelUriPath({ rootId, path })
      : `/${path.replace(/^\/+/, "")}`,
  });
}

type DeferredMonacoLanguageScheduler = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleDeferredMonacoLanguageLoad(callback: () => void): () => void {
  const scheduler = window as DeferredMonacoLanguageScheduler;
  let timeoutHandle = 0;
  let idleHandle = 0;

  const frameHandle = window.requestAnimationFrame(() => {
    if (scheduler.requestIdleCallback) {
      idleHandle = scheduler.requestIdleCallback(callback, { timeout: 600 });
      return;
    }
    timeoutHandle = window.setTimeout(callback, 0);
  });

  return () => {
    window.cancelAnimationFrame(frameHandle);
    if (idleHandle && scheduler.cancelIdleCallback) {
      scheduler.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
    }
  };
}

async function ensureMonacoLanguage(language: string): Promise<string> {
  if (language === "plaintext") return language;
  const loader = MONACO_LANGUAGE_LOADERS[language];
  if (!loader) return "plaintext";
  const cached = monacoLanguageLoadCache.get(language) ?? loader();
  monacoLanguageLoadCache.set(language, cached);
  try {
    await cached;
    return language;
  } catch (error) {
    console.warn(`[tracevane] Monaco language loader failed for ${language}`, error);
    monacoLanguageLoadCache.delete(language);
    return "plaintext";
  }
}

export const languageExtensionForPath = languageForPath;
export { languageForPath };

export default CodeEditor;

function configureMonacoWorkers(): void {
  const globalScope = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker?: (_workerId: string, label: string) => Worker;
    };
  };
  if (globalScope.MonacoEnvironment?.getWorker) return;
  globalScope.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === "json") return new JsonWorker();
      if (label === "css" || label === "scss" || label === "less")
        return new CssWorker();
      if (label === "html" || label === "handlebars" || label === "razor")
        return new HtmlWorker();
      if (label === "typescript" || label === "javascript")
        return new TsWorker();
      return new EditorWorker();
    },
  };
}
