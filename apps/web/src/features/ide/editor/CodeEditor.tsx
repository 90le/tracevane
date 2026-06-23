import * as React from "react";

import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
// `@codemirror/commands` ships `history` + the default/history keymaps. It is
// a transitive dependency of the declared `codemirror` meta-package and is
// installed in node_modules; consider adding it to apps/web/package.json for
// explicitness (left out of this commit per the "stage only this file" rule).
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";

import { cn } from "@/design/lib/utils";
import { CodeBlock } from "@/shared/diff/DiffView";

// ---------------------------------------------------------------------------
// Language picker
// ---------------------------------------------------------------------------

/**
 * Map a file path to its CodeMirror language extension by extension.
 *
 * `.ts/.tsx/.mts/.cts` are served by `javascript({ typescript: true })` — the
 * `@codemirror/lang-typescript` pack is not installed (see apps/web/package.json);
 * `lang-javascript` covers TypeScript when asked.
 *
 * Unknown extensions return an empty array (plain text, no highlighting).
 */
export function languageExtensionForPath(path: string): Extension[] {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return [javascript({ typescript: true })];
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return [javascript()];
    case "json":
      return [json()];
    case "md":
    case "markdown":
      return [markdown()];
    case "html":
    case "htm":
      return [html()];
    case "css":
      return [css()];
    case "py":
      return [python()];
    case "sql":
      return [sql()];
    case "yaml":
    case "yml":
      return [yaml()];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Large-file guard
// ---------------------------------------------------------------------------

/** Above this many bytes the file is treated as "too large to mount CM". */
const LARGE_FILE_BYTES = 1_000_000;
/** Above this many lines the file is treated as "too large to mount CM". */
const LARGE_FILE_LINES = 20_000;

function isLargeContent(content: string): boolean {
  if (content.length > LARGE_FILE_BYTES) return true;
  // Cheap line count: only scan when byte threshold hasn't already triggered.
  let lines = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      lines++;
      if (lines > LARGE_FILE_LINES) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CodeEditorProps {
  /** Path of the file being edited — picks the language and acts as doc identity. */
  path: string;
  /** Seed content. Read once on mount; subsequent changes are ignored (see contract). */
  initialContent: string;
  /** When true the doc cannot be modified but selection/scroll still work. */
  readOnly?: boolean;
  /** Emits the full doc string on every doc-changing transaction. */
  onChange?: (value: string) => void;
  /** Optional className for the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CodeMirror 6 code editor.
 *
 * ## Mount / reconciliation contract — READ BEFORE EDITING
 *
 * The parent MUST render this component keyed by `path`:
 *
 * ```tsx
 * <CodeEditor key={path} path={path} initialContent={content} onChange={...} />
 * ```
 *
 * Consequences:
 *  - Each open file is a **fresh mount**. Switching files unmounts the old
 *    `EditorView` (its cleanup disposes the view) and mounts a new one seeded
 *    from `initialContent`.
 *  - `initialContent` is therefore only ever a seed; it is **not** reconciled
 *    mid-edit. The parent owns save semantics and provides the latest on-disk
 *    content as `initialContent` only when (re)opening a file.
 *  - We deliberately do NOT watch `initialContent` in the mount effect, because
 *    doing so would clobber the buffer while the user is typing.
 *
 * ## Why `onChange` does not re-create the view
 *
 * `onChange` is unstable across parent renders. To avoid re-creating the
 * `EditorView` (which causes cursor jumps and data loss), the latest callback is
 * stored in a ref (`onChangeRef`) that is updated every render, and the
 * `EditorView.updateListener` reads `onChangeRef.current`. The view is created
 * exactly once per mount.
 *
 * ## Large files
 *
 * Files larger than ~1MB or ~20k lines would freeze CM on mount. Such files are
 * rendered read-only via `<CodeBlock>` from `@/shared/diff/DiffView` instead,
 * and `onChange` is never invoked for them.
 */
export function CodeEditor({
  path,
  initialContent,
  readOnly = false,
  onChange,
  className,
}: CodeEditorProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);

  // Stable ref to the latest onChange — the updateListener reads this so the
  // view never needs to be torn down when the parent passes a new closure.
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Re-mount when the file path changes. Per the contract above, the parent
  // also keys the component by `path`, so this effect runs once per file — but
  // depending on `path` keeps us correct even if the parent forgets the key.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString());
      }
    });

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      highlightSpecialChars(),
      history(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      ...languageExtensionForPath(path),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      updateListener,
      EditorState.readOnly.of(readOnly),
    ];

    const view = new EditorView({
      parent: host,
      // `doc` seed — never reconciled after this point (see contract).
      doc: initialContent,
      extensions,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally exclude `initialContent` (seed-only — see contract) and
    // `onChange` (read via ref). `readOnly` is also applied at mount only; flip
    // it by remounting (e.g. via a parent-provided key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readOnly]);

  // Large-file guard: never mount CM for huge files. This must run before the
  // effect above has a chance to create a view; we branch at render time so the
  // host div is never even attached to CM for oversized content.
  if (isLargeContent(initialContent)) {
    return (
      <div className={cn("grid min-h-0", className)}>
        <CodeBlock
          content={initialContent}
          label={
            <span>
              <span className="text-amber">大文件只读预览</span> · {path}
            </span>
          }
          maxHeightClassName="max-h-[70vh]"
        />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        // CM injects its own DOM under this node; the wrapper just provides
        // sizing/scroll context. `min-h-0` lets it flex inside grid parents.
        "cm-host min-h-0 overflow-auto text-sm",
        className,
      )}
      data-path={path}
    />
  );
}

export default CodeEditor;
