import * as React from "react";

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
 * The panels are intentionally placeholders for now — real explorer/editor/
 * preview/terminal are filled in by subsequent P1 tasks. They render real
 * Aurora-styled chrome so the shell is visibly an IDE, not an empty box.
 *
 * Layout grid:
 *   columns:  [activity(52px) | rest]
 *   rest rows:[ main row (1fr) | bottom panel (auto) | status bar (auto) ]
 *   main cols:[ side(260px) | editor(1fr) | preview(340px) ]
 */
export function IdeShell() {
  const [activity, setActivity] = React.useState<IdeActivity>("files");
  return (
    <div className="grid h-dvh w-screen grid-cols-[var(--ide-activity,52px)_minmax(0,1fr)] overflow-hidden bg-canvas text-ink">
      <ActivityBar activity={activity} onChange={setActivity} />
      <div className="grid min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden">
        <div className="grid min-h-0 grid-cols-[var(--ide-side,260px)_minmax(0,1fr)_var(--ide-preview,340px)] overflow-hidden">
          <SidePanel activity={activity} />
          <EditorArea />
          <Preview />
        </div>
        <BottomPanel />
        <StatusBar />
      </div>
    </div>
  );
}
