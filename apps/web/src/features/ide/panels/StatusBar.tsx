import { Check, GitBranch, Save } from "lucide-react";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StatusBarProps {
  /** Active file root id (for future git/save indicators). */
  rootId?: string;
  /** Currently open file path (shown when present). */
  selectedPath?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bottom status bar — mirrors the VS Code status bar pattern (branch,
 * changes count, save indicator). In P1 these are static placeholders with
 * Aurora styling. The component now receives `rootId` + `selectedPath`
 * (lifted into IdeShell state) so Phase 2.2 can show real git/save state
 * without changing the shell.
 */
export function StatusBar({ rootId, selectedPath }: StatusBarProps) {
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
        <Check className="size-3" />
        <span>已保存</span>
      </span>
      <span className="opacity-80">UTF-8</span>
      <span className="opacity-80">LF</span>
      {rootId && <span className="opacity-60">{rootId}</span>}
    </footer>
  );
}
