import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, LayoutDashboard, ListChecks, ScrollText } from "lucide-react";

import { cn } from "@/design/lib/utils";

import { RECOVERY_VIEWS, type RecoveryView } from "./types";
import { BackupsView, EventsView, IssuesView, OverviewView } from "./views";

const TABS: ReadonlyArray<{
  view: RecoveryView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "issues", label: "问题与修复", icon: ListChecks },
  { view: "events", label: "事件", icon: ScrollText },
  { view: "backups", label: "备份", icon: Archive },
];

function isRecoveryView(value: string | null): value is RecoveryView {
  return value != null && (RECOVERY_VIEWS as readonly string[]).includes(value);
}

/**
 * Platform Guard page for OpenClaw substrate recovery. Owns the primary `viewbar` tabs over the
 * `overview | issues | events | backups` view set. The active view is driven
 * from the URL search param (`?view=`) so views are deep-linkable and the
 * browser back/forward buttons work. Content lives in `./views`.
 *
 * SAFETY: `probe` (Issues view) is directly executable; `config-repair` /
 * `repair` (Issues) and `restore-backup` (Backups) plus the service
 * lifecycle (Overview) are all gated behind strong confirmations with
 * evidence — never one-click.
 */
export function RecoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const resolvedView: RecoveryView = isRecoveryView(viewParam) ? viewParam : "overview";

  const goToView = React.useCallback(
    (view: RecoveryView) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", view);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  // Overview deep-links into other views; wire its navigation to the page.
  const renderView = () => {
    switch (resolvedView) {
      case "issues":
        return <IssuesView />;
      case "events":
        return <EventsView />;
      case "backups":
        return <BackupsView />;
      default:
        return <OverviewView goToView={goToView} />;
    }
  };

  return (
    <div className="grid gap-4">
      <nav
        className="flex flex-wrap gap-1 border-b border-line pb-2"
        aria-label="平台守护视图"
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

      {renderView()}
    </div>
  );
}
