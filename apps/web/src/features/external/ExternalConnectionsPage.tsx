import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { KeyRound, LayoutDashboard, PlugZap, Wrench } from "lucide-react";

import { cn } from "@/design/lib/utils";

import {
  AuthView,
  CapabilitiesView,
  ConnectionsView,
  OverviewView,
  EXTERNAL_VIEWS,
  type ExternalView,
  type ExternalViewProps,
} from "./views";

/** Primary `viewbar` tabs (IA: overview / connections / capabilities / auth). */
const PRIMARY_TABS: ReadonlyArray<{
  view: ExternalView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "connections", label: "连接", icon: PlugZap },
  { view: "capabilities", label: "能力", icon: Wrench },
  { view: "auth", label: "授权边界", icon: KeyRound },
];

const VIEW_COMPONENTS: Record<ExternalView, (props: ExternalViewProps) => React.JSX.Element> = {
  overview: OverviewView,
  connections: ConnectionsView,
  capabilities: CapabilitiesView,
  auth: AuthView,
};

function isExternalView(value: string | null): value is ExternalView {
  return value != null && (EXTERNAL_VIEWS as readonly string[]).includes(value);
}

/**
 * Integration Evidence page. `/external` has NO dedicated backend and is kept
 * as a compatibility deep-link — it is a read-only AGGREGATION / evidence console that synthesizes third-party
 * connection state from existing source APIs (OpenClaw config/MCP, Skills,
 * Gateway app-connections, Channel Connector runtime, system diagnostics) and
 * links OUT to the owning domain for any write.
 *
 * Owns the primary `viewbar` tabs over the view set
 * (`overview|connections|capabilities|auth`). The active view + the selected
 * connection (`?conn=<id>`) are driven entirely from the URL search params, so
 * views are deep-linkable and browser back/forward work. Content lives in
 * `./views`.
 */
export function ExternalConnectionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const connParam = searchParams.get("conn");

  const resolvedView: ExternalView = isExternalView(viewParam) ? viewParam : "overview";
  const selectedConnection = connParam && connParam.length > 0 ? connParam : null;

  const goToView = React.useCallback<ExternalViewProps["goToView"]>(
    (view, params) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", view);
          if (params?.conn) {
            next.set("conn", params.conn);
          } else {
            next.delete("conn");
          }
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
      {/* Primary viewbar */}
      <nav className="flex flex-wrap gap-1 border-b border-line pb-2" aria-label="集成证据视图">
        {PRIMARY_TABS.map(({ view, label, icon: Icon }) => {
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

      <ActiveView goToView={goToView} selectedConnection={selectedConnection} />
    </div>
  );
}
