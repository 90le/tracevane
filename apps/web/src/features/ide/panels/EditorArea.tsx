import { FileCode } from "lucide-react";

/**
 * Center editor area. In P1 this is a placeholder that renders the
 * "no file open" empty state with Aurora chrome (a tab strip header that
 * reads "Untitled" disabled, plus a centered empty hint). The real Monaco /
 * code viewer lands in a later task.
 */
export function EditorArea() {
  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas">
      <div className="flex h-9 items-center gap-1 border-b border-line bg-panel px-2">
        <div className="flex h-7 items-center gap-2 rounded-t-md border border-b-0 border-line px-3 text-sm text-subtle">
          <FileCode className="size-3.5" />
          <span className="italic">未打开文件</span>
        </div>
      </div>
      <div className="grid min-h-0 place-items-center p-8 text-center">
        <div>
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-md bg-panel-2 text-subtle shadow-sm">
            <FileCode className="size-6" />
          </div>
          <p className="text-base text-ink-strong">未打开文件</p>
          <p className="mt-1 text-sm text-muted">从左侧资源管理器选择文件以查看内容</p>
          <p className="mt-2 text-2xs text-subtle">P1 占位 · 编辑器将在后续任务接入</p>
        </div>
      </div>
    </section>
  );
}
