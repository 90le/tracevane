import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "@/design/ui/page-header";
import { SectionNav } from "@/design/ui/section-nav";
import { LoadingState } from "@/shared/states/LoadingState";

import {
  CHANNEL_CONNECTORS_VIEWS,
  type ChannelConnectorsView,
  type ChannelConnectorsViewProps,
} from "./views/types";

/** Primary in-page sections; shared channel-connector contracts live in types/channel-connectors.ts. */
const PRIMARY_TABS: ReadonlyArray<{
  view: ChannelConnectorsView;
  label: string;
}> = [
  { view: "overview", label: "概览" },
  { view: "workspaces", label: "Agent 工作区" },
  { view: "accounts", label: "渠道账号" },
  { view: "sessions", label: "会话" },
  { view: "runtime", label: "运行中心" },
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
 * Channel Connectors page: one PageHeader + SectionNav over the IM domain.
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
      <PageHeader
        className="px-0"
        title="消息接入"
        description="连接飞书、Lark 与 Octo 消息平台，把会话投递到 Agent 工作区；统一管理账号、分发策略、会话与运行状态。"
      />
      <div className="sm:hidden">
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
      <nav className="hidden flex-wrap gap-1 border-b border-line pb-2 sm:flex">
        <SectionNav
          ariaLabel="IM 渠道视图"
          items={PRIMARY_TABS.map(({ view, label }) => ({ id: view, label }))}
          value={resolvedView}
          onChange={(id) => goToView(id as ChannelConnectorsView)}
        />
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
