import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  ListChecks,
  Terminal,
} from "lucide-react";

import { cn } from "@/design/lib/utils";

import {
  CLI_AGENTS_VIEWS,
  type CliAgentsView,
  type CliAgentsViewNavParams,
  type CliAgentsViewProps,
} from "./types";
import {
  CliRuntimeView,
  EvidenceView,
  OverviewView,
  RunsView,
} from "./views";

/** Primary `viewbar` tabs (mirrors the established feature pages). */
const TABS: ReadonlyArray<{
  view: CliAgentsView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "runs", label: "运行中", icon: ListChecks },
  { view: "cli", label: "CLI", icon: Terminal },
  { view: "evidence", label: "原始证据", icon: Activity },
];

const VIEW_COMPONENTS: Record<
  CliAgentsView,
  (props: CliAgentsViewProps) => React.JSX.Element
> = {
  overview: OverviewView,
  runs: RunsView,
  cli: CliRuntimeView,
  evidence: EvidenceView,
};

function isCliAgentsView(value: string | null): value is CliAgentsView {
  return value != null && (CLI_AGENTS_VIEWS as readonly string[]).includes(value);
}

/**
 * CLI Agent Workbench (`/cli-agents`) page. Owns the primary `viewbar` tabs and
 * a URL-driven view state machine over the `data-view` set
 * (`overview|runs|cli|evidence`). The active view comes entirely from
 * the search params, so views are
 * deep-linkable and browser back/forward work. Content lives in `./views`.
 */
export function CliAgentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const resolvedView: CliAgentsView = isCliAgentsView(viewParam) ? viewParam : "overview";
  const goToView = React.useCallback<CliAgentsViewProps["goToView"]>(
    (view: CliAgentsView, _params?: CliAgentsViewNavParams) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", view);
          next.delete("agent");
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const ActiveView = VIEW_COMPONENTS[resolvedView];

  return (
    <div className="grid gap-4">
      <nav
        className="flex flex-wrap gap-1 border-b border-line pb-2"
        aria-label="CLI 代理视图"
      >
        {TABS.map(({ view, label, icon: Icon }) => {
          const active = resolvedView === view;
          return (
            <button
              key={view}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => goToView(view)}
              className={cn(
                "inline-flex h-9 items-center gap-[7px] rounded-sm px-3 text-base outline-none transition-colors",
                "[&_svg]:size-[15px] focus-visible:shadow-[var(--ring)]",
                active
                  ? "bg-primary-soft text-ink-strong [&_svg]:text-primary"
                  : "text-muted hover:bg-panel-2 hover:text-ink",
              )}
            >
              <Icon />
              {label}
            </button>
          );
        })}
      </nav>

      <ActiveView goToView={goToView} selectedAgent={null} />
    </div>
  );
}
