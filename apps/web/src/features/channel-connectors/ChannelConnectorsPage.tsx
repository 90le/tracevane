import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Bot, LayoutDashboard, MessageSquare, RadioTower } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { LoadingState } from "@/shared/states/LoadingState";

import {
  CHANNEL_CONNECTORS_VIEWS,
  type ChannelConnectorsView,
  type ChannelConnectorsViewProps,
} from "./views/types";

/** Primary local viewbar tabs per docs/channel-connectors/channel-connectors-overhaul-plan.md. */
const PRIMARY_TABS: ReadonlyArray<{
  view: ChannelConnectorsView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "workspaces", label: "Agent 工作区", icon: Bot },
  { view: "accounts", label: "渠道账号", icon: RadioTower },
  { view: "sessions", label: "会话", icon: MessageSquare },
  { view: "runtime", label: "运行中心", icon: Activity },
];

const VIEW_COMPONENTS: Record<
  ChannelConnectorsView,
  React.LazyExoticComponent<
    (props: ChannelConnectorsViewProps) => React.JSX.Element
  >
> = {
  overview: React.lazy(() =>
    import("./views/V3OverviewView").then((module) => ({
      default: module.V3OverviewView,
    })),
  ),
  workspaces: React.lazy(() =>
    import("./views/WorkspacesView").then((module) => ({
      default: module.WorkspacesView,
    })),
  ),
  accounts: React.lazy(() =>
    import("./views/V3AccountsView").then((module) => ({
      default: module.V3AccountsView,
    })),
  ),
  sessions: React.lazy(() =>
    import("./views/SessionsView").then((module) => ({
      default: module.SessionsView,
    })),
  ),
  runtime: React.lazy(() =>
    import("./views/V3RuntimeView").then((module) => ({
      default: module.V3RuntimeView,
    })),
  ),
};

function ChannelConnectorsViewFallback() {
  return (
    <div className="rounded-md border border-line bg-panel">
      <LoadingState title="正在打开消息接入视图…" />
    </div>
  );
}

function isChannelConnectorsView(value: string | null): value is ChannelConnectorsView {
  return value != null && (CHANNEL_CONNECTORS_VIEWS as readonly string[]).includes(value);
}

function canonicalView(value: string | null): ChannelConnectorsView {
  if (isChannelConnectorsView(value)) return value;
  return "overview";
}

/**
 * Channel Connectors page. Owns the Aurora local viewbar over the IM domain.
 * Content views are layered by primary object, not by backend module names.
 */
export function ChannelConnectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const accountParam = searchParams.get("account");
  const targetParam = searchParams.get("target");

  const resolvedView = canonicalView(viewParam);
  const selectedAccount = accountParam && accountParam.length > 0 ? accountParam : null;
  const selectedTarget = targetParam && targetParam.length > 0 ? targetParam : null;

  const goToView = React.useCallback<ChannelConnectorsViewProps["goToView"]>(
    (view, params) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", view);
          if (params?.account) next.set("account", params.account);
          else next.delete("account");
          if (params?.target) next.set("target", params.target);
          else next.delete("target");
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
        <ActiveView
          goToView={goToView}
          selectedAccount={selectedAccount}
          selectedTarget={selectedTarget}
        />
      </React.Suspense>
    </div>
  );
}
