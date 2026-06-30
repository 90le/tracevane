import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, LayoutDashboard, MessageSquare, PlugZap, RadioTower } from "lucide-react";

import { cn } from "@/design/lib/utils";

import {
  CHANNEL_CONNECTORS_VIEWS,
  type ChannelConnectorsView,
  type ChannelConnectorsViewProps,
} from "./views/types";

/** Primary local viewbar tabs per docs/IM渠道前端设计契约.md. */
const PRIMARY_TABS: ReadonlyArray<{
  view: ChannelConnectorsView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "accounts", label: "平台账号", icon: RadioTower },
  { view: "routes", label: "绑定路由", icon: PlugZap },
  { view: "deliveries", label: "会话投递", icon: MessageSquare },
  { view: "diagnostics", label: "守护诊断", icon: Activity },
];

const VIEW_COMPONENTS: Record<
  ChannelConnectorsView,
  React.LazyExoticComponent<
    (props: ChannelConnectorsViewProps) => React.JSX.Element
  >
> = {
  overview: React.lazy(() =>
    import("./views/OverviewView").then((module) => ({
      default: module.OverviewView,
    })),
  ),
  accounts: React.lazy(() =>
    import("./views/AccountsView").then((module) => ({
      default: module.AccountsView,
    })),
  ),
  routes: React.lazy(() =>
    import("./views/RoutesView").then((module) => ({
      default: module.RoutesView,
    })),
  ),
  deliveries: React.lazy(() =>
    import("./views/SessionsView").then((module) => ({
      default: module.SessionsView,
    })),
  ),
  diagnostics: React.lazy(() =>
    import("./views/DiagnosticsView").then((module) => ({
      default: module.DiagnosticsView,
    })),
  ),
};


function ChannelConnectorsViewFallback() {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-md border border-line bg-panel p-6 text-sm text-muted">
      <div className="grid justify-items-center gap-3">
        <span className="size-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span>正在打开消息接入视图…</span>
      </div>
    </div>
  );
}

function isChannelConnectorsView(value: string | null): value is ChannelConnectorsView {
  return value != null && (CHANNEL_CONNECTORS_VIEWS as readonly string[]).includes(value);
}

/**
 * Channel Connectors page. Owns the Aurora local viewbar over the IM domain.
 * Content views are layered by primary object, not by backend module names.
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
          if (params?.binding) next.set("binding", params.binding);
          else next.delete("binding");
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
      <div className="border-b border-line pb-2 sm:hidden">
        <label className="sr-only" htmlFor="channel-connectors-mobile-view">
          IM 渠道视图
        </label>
        <select
          id="channel-connectors-mobile-view"
          value={resolvedView}
          onChange={(event) => goToView(event.target.value as ChannelConnectorsView)}
          className="h-10 w-full rounded-sm border border-line-2 bg-panel px-3 text-base text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
        >
          {PRIMARY_TABS.map(({ view, label }) => (
            <option key={view} value={view}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <nav className="hidden flex-wrap gap-1 border-b border-line pb-2 sm:flex" aria-label="IM 渠道视图">
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

      <React.Suspense fallback={<ChannelConnectorsViewFallback />}>
        <ActiveView goToView={goToView} selectedBinding={selectedBinding} />
      </React.Suspense>
    </div>
  );
}
