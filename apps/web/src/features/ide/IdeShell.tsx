import * as React from "react";

import { useFilesSummaryQuery } from "@/lib/query/files";

import { ActivityBar, type IdeActivity } from "@/features/ide/panels/ActivityBar";
import { BottomPanel } from "@/features/ide/panels/BottomPanel";
import { SidePanel } from "@/features/ide/panels/SidePanel";
import { StatusBar } from "@/features/ide/panels/StatusBar";
import { EditorArea } from "@/features/ide/panels/EditorArea";
import { Preview } from "@/features/ide/panels/Preview";

/**
 * Full-bleed Workspace IDE window.
 *
 * This shell renders OUTSIDE the {@link AppShell} layout (no app sidebar /
 * topbar). It occupies the whole viewport and lays out the IDE chrome:
 * activity bar + side panel + editor + preview + bottom panel + status bar.
 *
 * The shell owns two pieces of shared state so the panels can stay
 * presentation-only:
 *  - `rootId` — the active file root (resolved from the files summary; the
 *    explorer can switch it via `onChangeRoot`);
 *  - `openFile` — the path of the file currently open in the editor (set by
 *    the explorer's `onSelectFile`; consumed by EditorArea, which is still a
 *    placeholder but receives the path so a later task can open it).
 *
 * Layout grid:
 *   columns:  [activity(52px) | rest]
 *   rest rows:[ main row (1fr) | bottom panel (auto) | status bar (auto) ]
 *   main cols:[ side(260px) | editor(1fr) | preview(340px) ]
 */
export function IdeShell() {
  const [activity, setActivity] = React.useState<IdeActivity>("files");

  // --- Shared "open file" state (lifted here; Phase 4 editor consumes it) ---
  const [openFile, setOpenFile] = React.useState<string | undefined>(undefined);

  // --- Active root resolution ------------------------------------------------
  const summary = useFilesSummaryQuery();
  const roots = summary.data?.roots ?? [];
  const defaultRootId = React.useMemo(() => {
    if (roots.length === 0) return "";
    return (
      roots.find((r) => r.id === "project-root")?.id ||
      roots.find((r) => r.preferred === true)?.id ||
      roots.find((r) => r.id === summary.data?.defaultRootId)?.id ||
      roots[0].id
    );
  }, [roots, summary.data?.defaultRootId]);

  const [rootId, setRootId] = React.useState<string>(defaultRootId);

  // Keep local rootId in sync when the summary first resolves (or the
  // server-side default changes and the user hasn't picked manually).
  React.useEffect(() => {
    if (defaultRootId && !rootId) setRootId(defaultRootId);
  }, [defaultRootId, rootId]);

  const handleSelectFile = React.useCallback((path: string) => {
    setOpenFile(path);
  }, []);

  const handleChangeRoot = React.useCallback((next: string) => {
    setRootId(next);
  }, []);

  return (
    <div className="grid h-dvh w-screen grid-cols-[var(--ide-activity,52px)_minmax(0,1fr)] overflow-hidden bg-canvas text-ink">
      <ActivityBar activity={activity} onChange={setActivity} />
      <div className="grid min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden">
        <div className="grid min-h-0 grid-cols-[var(--ide-side,260px)_minmax(0,1fr)_var(--ide-preview,340px)] overflow-hidden">
          <SidePanel
            activity={activity}
            rootId={rootId}
            selectedPath={openFile}
            onSelectFile={handleSelectFile}
            onChangeRoot={handleChangeRoot}
          />
          <EditorArea openFile={openFile} rootId={rootId} />
          <Preview />
        </div>
        <BottomPanel />
        <StatusBar rootId={rootId} selectedPath={openFile} />
      </div>
    </div>
  );
}
