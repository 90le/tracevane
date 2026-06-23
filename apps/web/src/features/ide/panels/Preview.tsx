import { Eye } from "lucide-react";

/**
 * Right-side preview pane. In P1 this is a placeholder rendering Aurora
 * chrome — a header reading "预览" and a centered muted hint. The real
 * preview surface lands in a later task.
 */
export function Preview() {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-l border-line bg-panel">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
        <Eye className="size-3.5 text-muted" />
        <span className="truncate text-ink-strong">预览</span>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center px-4 py-6 text-center">
        <div className="max-w-[240px]">
          <div className="mx-auto mb-2 grid size-8 place-items-center rounded-md bg-panel-2 text-subtle">
            <Eye className="size-4" />
          </div>
          <p className="text-sm text-muted">渲染预览将在此呈现</p>
          <p className="mt-1 text-2xs text-subtle">P1 占位 · 预览将在后续任务接入</p>
        </div>
      </div>
    </aside>
  );
}
