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
        "relative grid h-dvh min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(99,102,241,0.18),transparent_28%),linear-gradient(135deg,#020617_0%,#08111f_42%,#0f172a_100%)] text-slate-100",
        className,
      )}
      data-workspace-season-one-frame
    >
      <header
        className="z-20 border-b border-cyan-200/10 bg-slate-950/72 shadow-[0_18px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
        data-workspace-season-one-topbar
      >
        {topbar}
      </header>

      <div
        className={cn(
          "grid min-h-0 min-w-0 overflow-hidden",
          "grid-cols-1",
          "md:grid-cols-[64px_minmax(248px,312px)_minmax(0,1fr)]",
          "xl:grid-cols-[72px_minmax(272px,340px)_minmax(0,1fr)_minmax(304px,384px)]",
        )}
        data-workspace-season-one-body
      >
        <nav
          aria-label="Workspace activity"
          className="hidden min-h-0 border-r border-cyan-200/10 bg-black/20 md:block"
          data-workspace-season-one-activity
        >
          {activityRail}
        </nav>

        <aside
          aria-label="Workspace resources"
          className="hidden min-h-0 overflow-hidden border-r border-cyan-200/10 bg-white/[0.045] backdrop-blur-xl md:block"
          data-workspace-season-one-resources
        >
          {resources}
        </aside>

        <main
          aria-label="Workspace primary stage"
          className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-slate-100 text-slate-950 dark:bg-transparent dark:text-slate-50"
          data-workspace-season-one-stage
        >
          <div
            className="min-h-0 min-w-0 overflow-auto"
            data-workspace-season-one-stage-content
          >
            {stage}
          </div>
          <section
            aria-label="Workspace bottom panel"
            className="min-h-0 border-t border-cyan-200/10 bg-black/88 text-slate-50 shadow-[0_-24px_80px_rgba(0,0,0,0.32)] dark:border-white/10"
            data-workspace-season-one-bottom-panel
          >
            {bottomPanel}
          </section>
        </main>

        <aside
          aria-label="Workspace context and evidence"
          className="hidden min-h-0 overflow-hidden border-l border-cyan-200/10 bg-black/24 backdrop-blur-xl xl:block"
          data-workspace-season-one-context
        >
          {contextRail}
        </aside>
      </div>

      <div className="md:hidden" data-workspace-season-one-mobile-switcher>
        {mobileSwitcher}
      </div>
      <footer
        className="border-t border-cyan-200/10 bg-cyan-400 text-slate-950"
        data-workspace-season-one-status
      >
        {statusBar}
      </footer>
    </section>
  );
}
