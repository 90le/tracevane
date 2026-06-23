import { Eye } from "lucide-react";

import { MarkdownPreview } from "@/features/ide/preview/MarkdownPreview";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PreviewProps {
  /** Path of the active file (markdown detection happens inside). */
  path?: string;
  /** Live edited content of the active file (tracks editor edits). */
  content?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Right-side preview pane for the Workspace IDE.
 *
 * Hosts the header chrome ("预览") and delegates the body to
 * {@link MarkdownPreview}, which branches on file type: Markdown files get
 * the live remark/rehype → DOMPurify → hljs pipeline; non-markdown files
 * render an "此文件类型暂无预览" placeholder; no open file renders the empty
 * hint. The preview pane never crashes the IDE — pipeline errors degrade to
 * a raw `<pre>`.
 */
export function Preview({ path, content }: PreviewProps) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-l border-line bg-panel">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
        <Eye className="size-3.5 text-muted" />
        <span className="truncate text-ink-strong">预览</span>
      </header>
      <div className="grid min-h-0 flex-1 place-items-stretch overflow-hidden">
        <MarkdownPreview path={path} content={content} />
      </div>
    </aside>
  );
}
