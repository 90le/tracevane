import { Check, GitBranch, Save } from "lucide-react";

/**
 * Bottom status bar — mirrors the VS Code status bar pattern (branch,
 * changes count, save indicator). In P1 these are static placeholders with
 * Aurora styling. Real values are wired in a later task once the IDE
 * connects to git / save state.
 */
export function StatusBar() {
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
      <span className="ml-auto inline-flex items-center gap-1 opacity-90">
        <Check className="size-3" />
        <span>已保存</span>
      </span>
      <span className="opacity-80">UTF-8</span>
      <span className="opacity-80">LF</span>
    </footer>
  );
}
