import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, LayoutDashboard, MessageSquare, PlugZap, RadioTower } from "lucide-react";

import { cn } from "@/design/lib/utils";

import {
  AccountsView,
  DiagnosticsView,
  OverviewView,
  RoutesView,
  SessionsView,
  CHANNEL_CONNECTORS_VIEWS,
  type ChannelConnectorsView,
  type ChannelConnectorsViewProps,
} from "./views";

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
  (props: ChannelConnectorsViewProps) => React.JSX.Element
> = {
  overview: OverviewView,
  accounts: AccountsView,
  routes: RoutesView,
  deliveries: SessionsView,
  diagnostics: DiagnosticsView,
};

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
      <nav className="flex flex-wrap gap-1 border-b border-line pb-2" aria-label="IM 渠道视图">
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
