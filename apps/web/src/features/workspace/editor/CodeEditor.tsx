import * as React from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/language/css/monaco.contribution.js";
import "monaco-editor/esm/vs/language/html/monaco.contribution.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";
import "monaco-editor/esm/vs/basic-languages/abap/abap.contribution.js";
import "monaco-editor/esm/vs/basic-languages/apex/apex.contribution.js";
import "monaco-editor/esm/vs/basic-languages/azcli/azcli.contribution.js";
import "monaco-editor/esm/vs/basic-languages/bat/bat.contribution.js";
import "monaco-editor/esm/vs/basic-languages/bicep/bicep.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cameligo/cameligo.contribution.js";
import "monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution.js";
import "monaco-editor/esm/vs/basic-languages/coffee/coffee.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/csp/csp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/css/css.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cypher/cypher.contribution.js";
import "monaco-editor/esm/vs/basic-languages/dart/dart.contribution.js";
import "monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ecl/ecl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/elixir/elixir.contribution.js";
import "monaco-editor/esm/vs/basic-languages/flow9/flow9.contribution.js";
import "monaco-editor/esm/vs/basic-languages/freemarker2/freemarker2.contribution.js";
import "monaco-editor/esm/vs/basic-languages/fsharp/fsharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution.js";
import "monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/handlebars/handlebars.contribution.js";
import "monaco-editor/esm/vs/basic-languages/hcl/hcl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/julia/julia.contribution.js";
import "monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution.js";
import "monaco-editor/esm/vs/basic-languages/less/less.contribution.js";
import "monaco-editor/esm/vs/basic-languages/lexon/lexon.contribution.js";
import "monaco-editor/esm/vs/basic-languages/liquid/liquid.contribution.js";
import "monaco-editor/esm/vs/basic-languages/lua/lua.contribution.js";
import "monaco-editor/esm/vs/basic-languages/m3/m3.contribution.js";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js";
import "monaco-editor/esm/vs/basic-languages/mdx/mdx.contribution.js";
import "monaco-editor/esm/vs/basic-languages/mips/mips.contribution.js";
import "monaco-editor/esm/vs/basic-languages/msdax/msdax.contribution.js";
import "monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pascaligo/pascaligo.contribution.js";
import "monaco-editor/esm/vs/basic-languages/perl/perl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pgsql/pgsql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/php/php.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pla/pla.contribution.js";
import "monaco-editor/esm/vs/basic-languages/postiats/postiats.contribution.js";
import "monaco-editor/esm/vs/basic-languages/powerquery/powerquery.contribution.js";
import "monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/protobuf/protobuf.contribution.js";
import "monaco-editor/esm/vs/basic-languages/pug/pug.contribution.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/qsharp/qsharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/r/r.contribution.js";
import "monaco-editor/esm/vs/basic-languages/razor/razor.contribution.js";
import "monaco-editor/esm/vs/basic-languages/redis/redis.contribution.js";
import "monaco-editor/esm/vs/basic-languages/redshift/redshift.contribution.js";
import "monaco-editor/esm/vs/basic-languages/restructuredtext/restructuredtext.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution.js";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sb/sb.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scala/scala.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scheme/scheme.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scss/scss.contribution.js";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/solidity/solidity.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sophia/sophia.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sparql/sparql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/st/st.contribution.js";
import "monaco-editor/esm/vs/basic-languages/swift/swift.contribution.js";
import "monaco-editor/esm/vs/basic-languages/systemverilog/systemverilog.contribution.js";
import "monaco-editor/esm/vs/basic-languages/tcl/tcl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/twig/twig.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typespec/typespec.contribution.js";
import "monaco-editor/esm/vs/basic-languages/vb/vb.contribution.js";
import "monaco-editor/esm/vs/basic-languages/wgsl/wgsl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

import { useTheme } from "@/app/providers";
import { cn } from "@/design/lib/utils";

configureMonacoWorkers();

const MONACO_KEYBOARD_CARET_GAP = 24;
const MONACO_KEYBOARD_MIN_OVERLAP = 8;
const MONACO_KEYBOARD_MAX_INSET_RATIO = 0.38;
const MONACO_KEYBOARD_MAX_SCROLL_DELTA = 96;

export interface CodeEditorProps {
  path: string;
  initialContent: string;
  readOnly?: boolean;
  fontSize?: number;
  onChange?: (value: string) => void;
  onSelectionChange?: (selection: CodeEditorSelectionContext | null) => void;
  searchHighlights?: CodeEditorSearchHighlights;
  className?: string;
}

export interface CodeEditorSelectionContext {
  text: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CodeEditorSearchHighlights {
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  activeIndex: number;
}

export function CodeEditor({
  path,
  initialContent,
  readOnly = false,
  fontSize = 13,
  onChange,
  onSelectionChange,
  searchHighlights,
  className,
}: CodeEditorProps) {
  const { theme } = useTheme();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const modelRef = React.useRef<monaco.editor.ITextModel | null>(null);
  const decorationsRef =
    React.useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  const pendingKeyboardScrollDeltaRef = React.useRef(0);
  const [editorKeyboardInset, setEditorKeyboardInset] = React.useState(0);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

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

    const language = languageForPath(path);
    const model = monaco.editor.createModel(
      initialContent,
      language,
      modelUriForPath(path),
    );
    const editor = monaco.editor.create(container, {
      model,
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontLigatures: true,
      fontSize,
      lineNumbers: "on",
      minimap: { enabled: false },
      padding: { top: 16, bottom: 16 },
      readOnly,
      renderLineHighlight: "all",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      theme: theme === "dark" ? "vs-dark" : "vs",
      wordWrap: "on",
    });
    monaco.editor.setModelLanguage(model, language);
    editorRef.current = editor;
    modelRef.current = model;
    decorationsRef.current = editor.createDecorationsCollection([]);
    const subscription = editor.onDidChangeModelContent(() => {
      onChangeRef.current?.(editor.getValue());
    });
    const cursorSubscription = editor.onDidChangeCursorPosition(() => {
      window.requestAnimationFrame(updateEditorKeyboardInset);
    });
    const selectionSubscription = editor.onDidChangeCursorSelection(() => {
      onSelectionChangeRef.current?.(readCodeEditorSelection(editor));
    });
    onSelectionChangeRef.current?.(readCodeEditorSelection(editor));
    const scrollSubscription = editor.onDidScrollChange(() => {
      window.requestAnimationFrame(updateEditorKeyboardInset);
    });
    const frame = requestAnimationFrame(() => editor.layout());

    return () => {
      cancelAnimationFrame(frame);
      subscription.dispose();
      cursorSubscription.dispose();
      selectionSubscription.dispose();
      onSelectionChangeRef.current?.(null);
      scrollSubscription.dispose();
      decorationsRef.current?.clear();
      decorationsRef.current = null;
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
    // Recreate the Monaco model only when the backing file changes. Content updates from typing are owned by Monaco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, updateEditorKeyboardInset]);

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
    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
    editor.updateOptions({ theme: theme === "dark" ? "vs-dark" : "vs" });
    requestAnimationFrame(() => editor.layout());
  }, [theme]);

  React.useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  React.useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
    requestAnimationFrame(() => editorRef.current?.layout());
  }, [fontSize]);

  React.useEffect(() => {
    const editor = editorRef.current;
    const decorations = decorationsRef.current;
    const model = modelRef.current;
    if (!editor || !decorations || !model || !searchHighlights?.query) {
      decorations?.clear();
      return;
    }
    let matches: monaco.editor.FindMatch[] = [];
    try {
      matches = model.findMatches(
        searchHighlights.query,
        false,
        searchHighlights.regex,
        searchHighlights.caseSensitive,
        null,
        false,
        5_000,
      );
    } catch {
      decorations.clear();
      return;
    }
    const activeIndex =
      matches.length > 0
        ? Math.max(
            0,
            Math.min(searchHighlights.activeIndex, matches.length - 1),
          )
        : -1;
    decorations.set(
      matches.map((match, index) => ({
        range: match.range,
        options: {
          className:
            index === activeIndex
              ? "tv-monaco-search-match-active"
              : "tv-monaco-search-match",
          inlineClassName:
            index === activeIndex
              ? "tv-monaco-search-inline-active"
              : "tv-monaco-search-inline",
          overviewRuler: {
            color: index === activeIndex ? "#f59e0b" : "#3358ff",
            position: monaco.editor.OverviewRulerLane.Center,
          },
        },
      })),
    );
    if (activeIndex >= 0) {
      editor.revealRangeInCenterIfOutsideViewport(matches[activeIndex].range);
      editor.setSelection(matches[activeIndex].range);
    }
  }, [initialContent, searchHighlights]);

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
      data-workspace-shortcuts="ignore"
      data-code-editor-keyboard-inset={
        editorKeyboardInset > 0 ? "true" : "false"
      }
    >
      <div
        ref={containerRef}
        className="w-full"
        data-code-editor-container
        style={{ height: "100%" }}
      />
    </div>
  );
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

function modelUriForPath(path: string): monaco.Uri {
  return monaco.Uri.from({
    scheme: "file",
    path: `/${path.replace(/^\/+/, "")}`,
  });
}

export function languageForPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop()?.toLowerCase() ?? "";
  const lowerPath = normalized.toLowerCase();

  const override = languageOverrideForFile(fileName, lowerPath);
  if (override) return override;

  const registry = getRegisteredMonacoLanguageIndex();
  const exact = registry.filenames.get(fileName);
  if (exact) return exact;

  for (const [extension, languageId] of registry.extensions) {
    if (fileName.endsWith(extension)) return languageId;
  }

  if (fileName.endsWith("rc") && !fileName.includes(".")) return "ini";
  return "plaintext";
}

interface MonacoLanguageIndex {
  filenames: Map<string, string>;
  extensions: Array<[string, string]>;
}

let cachedMonacoLanguageIndex: MonacoLanguageIndex | null = null;

function getRegisteredMonacoLanguageIndex(): MonacoLanguageIndex {
  if (cachedMonacoLanguageIndex) return cachedMonacoLanguageIndex;

  const filenames = new Map<string, string>();
  const extensions: Array<[string, string]> = [];

  for (const language of monaco.languages.getLanguages()) {
    for (const filename of language.filenames ?? []) {
      filenames.set(filename.toLowerCase(), language.id);
    }
    for (const extension of language.extensions ?? []) {
      extensions.push([extension.toLowerCase(), language.id]);
    }
  }

  extensions.sort((left, right) => right[0].length - left[0].length);
  cachedMonacoLanguageIndex = { filenames, extensions };
  return cachedMonacoLanguageIndex;
}

function languageOverrideForFile(
  fileName: string,
  lowerPath: string,
): string | null {
  // Keep only product-specific or Monaco-gap aliases here. The default source of
  // truth is Monaco's own language registry (extensions/filenames), not a local
  // hand-maintained language table.
  if (fileName === "containerfile") return "dockerfile";
  if (fileName === "makefile") return "shell";
  if (fileName.startsWith(".env")) return "shell";
  if (fileName.endsWith(".vue")) return "html";
  if (fileName.endsWith(".svelte")) return "html";
  if (fileName.endsWith(".astro")) return "html";
  if (fileName.endsWith(".toml")) return "ini";
  if (lowerPath.includes("/dockerfile.")) return "dockerfile";
  return null;
}

export const languageExtensionForPath = languageForPath;

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
