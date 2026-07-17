import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { SectionNav } from "@/design/ui/section-nav";

import { RECOVERY_VIEWS, type RecoveryView } from "./types";
import { BackupsView, EventsView, IssuesView, OverviewView } from "./views";

const VIEW_ITEMS: { id: RecoveryView; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "issues", label: "问题与修复" },
  { id: "events", label: "事件" },
  { id: "backups", label: "备份" },
];

function isRecoveryView(value: string | null): value is RecoveryView {
  return value != null && (RECOVERY_VIEWS as readonly string[]).includes(value);
}

/**
 * Platform Guard page for OpenClaw substrate recovery — a status page. The
 * overview leads with the current-state banner and key health facts; events,
 * backups and guarded repair live in the sibling views, switched via SectionNav.
 * The active view is driven from the URL search param (`?view=`) so views are
 * deep-linkable and the browser back/forward buttons work. Content lives in
 * `./views`.
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
    <div className="grid gap-[18px]">
      <div className="sm:hidden">
        <label className="sr-only" htmlFor="recovery-mobile-view">
          平台守护视图
        </label>
        <select
          id="recovery-mobile-view"
          className="w-full rounded-sm border border-line bg-panel px-3 py-2 text-sm text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
          value={resolvedView}
          onChange={(event) => goToView(event.target.value as RecoveryView)}
        >
          {VIEW_ITEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <SectionNav
        className="hidden sm:inline-flex"
        ariaLabel="平台守护视图"
        items={VIEW_ITEMS}
        value={resolvedView}
        onChange={(id) => goToView(id as RecoveryView)}
      />

      {renderView()}
    </div>
  );
}
