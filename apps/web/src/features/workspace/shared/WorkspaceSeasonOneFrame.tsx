import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface WorkspaceSeasonOneFrameProps {
  topbar: React.ReactNode;
  activityRail: React.ReactNode;
  resources: React.ReactNode;
  stage: React.ReactNode;
  contextRail: React.ReactNode;
  bottomPanel: React.ReactNode;
  statusBar: React.ReactNode;
  mobileSwitcher: React.ReactNode;
  className?: string;
}

export function WorkspaceSeasonOneFrame({
  topbar,
  activityRail,
  resources,
  stage,
  contextRail,
  bottomPanel,
  statusBar,
  mobileSwitcher,
  className,
}: WorkspaceSeasonOneFrameProps) {
  return (
    <section
      aria-label="Tracevane Workspace Season One Frame"
      className={cn(
        "grid h-dvh min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-slate-950 text-slate-100",
        className,
      )}
      data-workspace-season-one-frame
    >
      <header
        className="z-20 border-b border-white/10 bg-slate-950/92 backdrop-blur"
        data-workspace-season-one-topbar
      >
        {topbar}
      </header>

      <div
        className={cn(
          "grid min-h-0 min-w-0 overflow-hidden",
          "grid-cols-1",
          "md:grid-cols-[56px_minmax(220px,280px)_minmax(0,1fr)]",
          "xl:grid-cols-[64px_minmax(248px,320px)_minmax(0,1fr)_minmax(280px,360px)]",
        )}
        data-workspace-season-one-body
      >
        <nav
          aria-label="Workspace activity"
          className="hidden min-h-0 border-r border-white/10 bg-slate-950/90 md:block"
          data-workspace-season-one-activity
        >
          {activityRail}
        </nav>

        <aside
          aria-label="Workspace resources"
          className="hidden min-h-0 overflow-hidden border-r border-white/10 bg-slate-900/70 md:block"
          data-workspace-season-one-resources
        >
          {resources}
        </aside>

        <main
          aria-label="Workspace primary stage"
          className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50"
          data-workspace-season-one-stage
        >
          <div className="min-h-0 min-w-0 overflow-auto" data-workspace-season-one-stage-content>
            {stage}
          </div>
          <section
            aria-label="Workspace bottom panel"
            className="min-h-0 border-t border-slate-200 bg-black text-slate-50 dark:border-white/10"
            data-workspace-season-one-bottom-panel
          >
            {bottomPanel}
          </section>
        </main>

        <aside
          aria-label="Workspace context and evidence"
          className="hidden min-h-0 overflow-hidden border-l border-white/10 bg-slate-950/88 xl:block"
          data-workspace-season-one-context
        >
          {contextRail}
        </aside>
      </div>

      <div className="md:hidden" data-workspace-season-one-mobile-switcher>
        {mobileSwitcher}
      </div>
      <footer
        className="border-t border-white/10 bg-blue-600 text-white"
        data-workspace-season-one-status
      >
        {statusBar}
      </footer>
    </section>
  );
}
