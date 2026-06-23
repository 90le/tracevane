import { FileCode } from "lucide-react";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EditorAreaProps {
  /** Path of the file currently "open" (set by the explorer). */
  openFile?: string;
  /** Root id the open file lives under (for future read queries). */
  rootId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Center editor area. In P1 this is a placeholder that renders the
 * "no file open" empty state with Aurora chrome (a tab strip header that
 * reads "Untitled" disabled, plus a centered empty hint). The real Monaco /
 * code viewer lands in a later task.
 *
 * The component now receives `openFile` + `rootId` (lifted into IdeShell state
 * by the explorer) so a later task can wire the real editor without changing
 * the shell. For now it only reflects the open-file name in the tab strip.
 */
export function EditorArea({ openFile, rootId }: EditorAreaProps) {
  const fileName = openFile ? openFile.split("/").pop() || openFile : null;
  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas">
      <div className="flex h-9 items-center gap-1 border-b border-line bg-panel px-2">
        <div
          className={
            "flex h-7 items-center gap-2 rounded-t-md border border-b-0 px-3 text-sm " +
            (fileName
              ? "border-line bg-canvas text-ink-strong"
              : "border-line text-subtle")
          }
        >
          <FileCode className="size-3.5" />
          <span className={fileName ? "" : "italic"}>
            {fileName ?? "未打开文件"}
          </span>
        </div>
      </div>
      <div className="grid min-h-0 place-items-center p-8 text-center">
        {fileName ? (
          <div>
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-md bg-panel-2 text-subtle shadow-sm">
              <FileCode className="size-6" />
            </div>
            <p className="text-base text-ink-strong">{fileName}</p>
            <p className="mt-1 font-mono text-2xs text-subtle">{openFile}</p>
            <p className="mt-2 text-2xs text-subtle">
              编辑器将在后续任务接入（rootId: {rootId || "—"}）
            </p>
          </div>
        ) : (
          <div>
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-md bg-panel-2 text-subtle shadow-sm">
              <FileCode className="size-6" />
            </div>
            <p className="text-base text-ink-strong">未打开文件</p>
            <p className="mt-1 text-sm text-muted">从左侧资源管理器选择文件以查看内容</p>
            <p className="mt-2 text-2xs text-subtle">P1 占位 · 编辑器将在后续任务接入</p>
          </div>
        )}
      </div>
    </section>
  );
}
