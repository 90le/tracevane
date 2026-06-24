import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, PlugZap, ScrollText, Terminal } from "lucide-react";

import { cn } from "@/design/lib/utils";

import {
  BindingsView,
  LogsView,
  OverviewView,
  SessionsView,
  CHANNEL_CONNECTORS_VIEWS,
  type ChannelConnectorsView,
  type ChannelConnectorsViewProps,
} from "./views";

/** Primary `viewbar` tabs (IA contract: overview / bindings / sessions / logs). */
const PRIMARY_TABS: ReadonlyArray<{
  view: ChannelConnectorsView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "bindings", label: "平台绑定", icon: PlugZap },
  { view: "sessions", label: "IM 会话", icon: Terminal },
  { view: "logs", label: "投递日志", icon: ScrollText },
];

const VIEW_COMPONENTS: Record<
  ChannelConnectorsView,
  (props: ChannelConnectorsViewProps) => React.JSX.Element
> = {
  overview: OverviewView,
  bindings: BindingsView,
  sessions: SessionsView,
  logs: LogsView,
};

function isChannelConnectorsView(value: string | null): value is ChannelConnectorsView {
  return value != null && (CHANNEL_CONNECTORS_VIEWS as readonly string[]).includes(value);
}

/**
 * Channel Connectors page. Owns the primary `viewbar` tabs over the view set
 * (`overview|bindings|sessions|logs`). The active view and the `bindings`
 * deep-link are driven entirely from the URL search params (`?view=`,
 * `?binding=<id>`), so views are deep-linkable and browser back/forward work.
 * Content lives in `./views`.
 */
export function ChannelConnectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const bindingParam = searchParams.get("binding");

  const resolvedView: ChannelConnectorsView = isChannelConnectorsView(viewParam)
    ? viewParam
    : "overview";
  const selectedBinding = bindingParam && bindingParam.length > 0 ? bindingParam : null;

  const goToView = React.useCallback<ChannelConnectorsViewProps["goToView"]>(
    (view, params) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", view);
          if (params?.binding) {
            next.set("binding", params.binding);
          } else {
            next.delete("binding");
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
      <nav
        className="flex flex-wrap gap-1 border-b border-line pb-2"
        aria-label="IM 渠道视图"
      >
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

      <ActiveView goToView={goToView} selectedBinding={selectedBinding} />
    </div>
  );
}
