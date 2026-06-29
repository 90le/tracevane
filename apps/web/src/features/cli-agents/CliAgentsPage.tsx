import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { ListChecks, Terminal } from "lucide-react";

import { cn } from "@/design/lib/utils";

import {
  CLI_AGENTS_VIEWS,
  type CliAgentsView,
  type CliAgentsViewNavParams,
  type CliAgentsViewProps,
} from "./types";

const RunsView = React.lazy(() =>
  import("./views/RunsView").then((module) => ({ default: module.RunsView })),
);
const CliRuntimeView = React.lazy(() =>
  import("./views/CliRuntimeView").then((module) => ({
    default: module.CliRuntimeView,
  })),
);

/** Primary `viewbar` tabs (mirrors the established feature pages). */
const TABS: ReadonlyArray<{
  view: CliAgentsView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "runs", label: "运行台", icon: ListChecks },
  { view: "cli", label: "启动 / 修复", icon: Terminal },
];

const VIEW_COMPONENTS: Record<
  CliAgentsView,
  React.ComponentType<CliAgentsViewProps>
> = {
  runs: RunsView,
  cli: CliRuntimeView,
};

function isCliAgentsView(value: string | null): value is CliAgentsView {
  return (
    value != null && (CLI_AGENTS_VIEWS as readonly string[]).includes(value)
  );
}

/**
 * CLI Agent Workbench (`/cli-agents`) page. Owns the primary `viewbar` tabs and
 * a URL-driven view state machine over the `data-view` set
 * (`runs|cli`). The active view comes entirely from
 * the search params, so views are
 * deep-linkable and browser back/forward work. Content lives in `./views`.
 */
export function CliAgentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const resolvedView: CliAgentsView = isCliAgentsView(viewParam)
    ? viewParam
    : "runs";
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
    <div className="grid min-w-0 gap-4">
      <div className="border-b border-line pb-2 sm:hidden">
        <label className="sr-only" htmlFor="cli-agents-mobile-view">
          CLI 代理视图
        </label>
        <select
          id="cli-agents-mobile-view"
          value={resolvedView}
          onChange={(event) => goToView(event.target.value as CliAgentsView)}
          className="h-10 w-full rounded-sm border border-line-2 bg-panel px-3 text-base text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
        >
          {TABS.map(({ view, label }) => (
            <option key={view} value={view}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <nav
        className="hidden flex-wrap gap-1 border-b border-line pb-2 sm:flex"
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

      <React.Suspense fallback={<CliAgentsViewLoadingState />}>
        <ActiveView goToView={goToView} selectedAgent={null} />
      </React.Suspense>
    </div>
  );
}

function CliAgentsViewLoadingState() {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-md border border-line bg-panel p-6 text-sm text-muted">
      <div className="grid justify-items-center gap-3">
        <span className="size-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span>正在加载 CLI 代理视图…</span>
      </div>
    </div>
  );
}
