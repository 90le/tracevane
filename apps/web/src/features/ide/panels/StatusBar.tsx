import { Check, GitBranch, Save } from "lucide-react";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Save state for the active file, surfaced by EditorArea. */
export type SaveState = "idle" | "dirty" | "saving" | "saved";

export interface StatusBarProps {
  /** Active file root id (for future git/save indicators). */
  rootId?: string;
  /** Currently open file path (shown when present). */
  selectedPath?: string;
  /** Save state of the active file. */
  saveState?: SaveState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bottom status bar — mirrors the VS Code status bar pattern (branch,
 * changes count, save indicator). The save indicator reflects the real
 * {@link SaveState} surfaced by the EditorArea (dirty / saving / saved).
 */
export function StatusBar({
  rootId,
  selectedPath,
  saveState = "idle",
}: StatusBarProps) {
  return (
    <footer className="flex h-7 items-center gap-3 border-t border-line bg-primary px-3 text-2xs text-primary-ink">
      <span className="inline-flex items-center gap-1">
        <GitBranch className="size-3" />
        <span>main</span>
      </span>
      <span className="inline-flex items-center gap-1 opacity-90">
        <Save className="size-3" />
        <span>0 变更</span>
      </span>
      {selectedPath && (
        <span className="inline-flex min-w-0 items-center gap-1 opacity-90">
          <span className="truncate font-mono">{selectedPath}</span>
        </span>
      )}
      <span className="ml-auto inline-flex items-center gap-1 opacity-90">
        {saveState === "saving" ? (
          <>
            <span className="inline-block size-3 animate-spin rounded-full border border-current border-r-transparent align-middle" />
            <span>保存中</span>
          </>
        ) : saveState === "dirty" ? (
          <>
            <span className="inline-block size-2.5 rounded-full bg-current align-middle" />
            <span>已修改</span>
          </>
        ) : saveState === "saved" ? (
          <>
            <Check className="size-3" />
            <span>已保存</span>
          </>
        ) : (
          <>
            <Check className="size-3" />
            <span>已保存</span>
          </>
        )}
      </span>
      <span className="opacity-80">UTF-8</span>
      <span className="opacity-80">LF</span>
      {rootId && <span className="opacity-60">{rootId}</span>}
    </footer>
  );
}
