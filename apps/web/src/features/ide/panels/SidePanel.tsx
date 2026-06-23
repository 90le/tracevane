import { Folder, Search, Sparkles } from "lucide-react";

import type { IdeActivity } from "@/features/ide/panels/ActivityBar";
import { IdeExplorer } from "@/features/ide/explorer/IdeExplorer";
import { GitPanel } from "@/features/ide/explorer/GitPanel";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface SidePanelProps {
  activity: IdeActivity;
  /** Root id for the files explorer (Files activity). */
  rootId?: string;
  /** Currently selected file path (Files activity highlight). */
  selectedPath?: string;
  /** Fired when a file is opened from the explorer. */
  onSelectFile?: (path: string) => void;
  /** Fired when the user switches the active root in the explorer header. */
  onChangeRoot?: (rootId: string) => void;
  /**
   * Fired when the Git panel asks to open a changed file's diff. A later
   * task will route this to the editor diff view; for now the shell stores
   * the target path so the editor area can consume it.
   */
  onOpenDiff?: (file: string) => void;
}

// ---------------------------------------------------------------------------
// Placeholders for activities not yet implemented
// ---------------------------------------------------------------------------

const PLACEHOLDERS: Record<
  Extract<IdeActivity, "search" | "agent">,
  { title: string; hint: string; icon: typeof Folder }
> = {
  search: { title: "搜索", hint: "跨文件搜索将在此呈现", icon: Search },
  agent: { title: "Agent", hint: "AI 代理（规划中）", icon: Sparkles },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Left-side panel that switches its body per active IDE view.
 *
 * For the `files` activity it renders the real {@link IdeExplorer} (composing
 * the reusable Phase 1 file core); for the `git` activity it renders the real
 * {@link GitPanel} (stage/unstage/commit/branch). The remaining activities
 * (`search` / `agent`) still render Aurora-styled placeholders pending their
 * own P1 tasks.
 */
export function SidePanel({
  activity,
  rootId,
  selectedPath,
  onSelectFile,
  onChangeRoot,
  onOpenDiff,
}: SidePanelProps) {
  // --- Files activity: real explorer --------------------------------------
  if (activity === "files") {
    return (
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
        <IdeExplorer
          rootId={rootId ?? ""}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onChangeRoot={onChangeRoot}
        />
      </aside>
    );
  }

  // --- Git activity: real GitPanel ----------------------------------------
  if (activity === "git") {
    return (
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
        <GitPanel rootId={rootId ?? ""} onOpenDiff={onOpenDiff} />
      </aside>
    );
  }

  // --- Other activities: placeholders -------------------------------------
  const meta = PLACEHOLDERS[activity];
  const Icon = meta.icon;
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
        <Icon className="size-3.5 text-muted" />
        <span className="truncate text-ink-strong">{meta.title}</span>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center px-4 py-6 text-center">
        <div className="max-w-[200px]">
          <div className="mx-auto mb-2 grid size-8 place-items-center rounded-md bg-panel-2 text-subtle">
            <Icon className="size-4" />
          </div>
          <p className="text-sm text-muted">{meta.hint}</p>
          <p className="mt-1 text-2xs text-subtle">P1 占位 · 后续任务接入真实数据</p>
        </div>
      </div>
    </aside>
  );
}
