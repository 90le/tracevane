import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Box, LayoutDashboard, Route } from "lucide-react";

import { cn } from "@/design/lib/utils";

import { MODEL_GATEWAY_APP_CONNECTION_IDS, type ModelGatewayAppConnectionId } from "./types";
import {
  AccountPoolView,
  AppConnectionsView,
  ModelsView,
  OverviewView,
  ProviderConfigView,
  ProvidersView,
  UsageView,
  MODEL_GATEWAY_VIEWS,
  type ModelGatewayView,
  type ModelGatewayViewProps,
} from "./views";

/** Primary `viewbar` tabs (IA contract: overview / providers / models / usage). */
const PRIMARY_TABS: ReadonlyArray<{
  view: ModelGatewayView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: "overview", label: "概览", icon: LayoutDashboard },
  { view: "providers", label: "服务商", icon: Route },
  { view: "models", label: "模型", icon: Box },
  { view: "usage", label: "用量", icon: BarChart3 },
];

/** Each sub-view maps back to the primary tab that should stay highlighted. */
const SUB_VIEW_PARENT: Record<ModelGatewayView, ModelGatewayView> = {
  overview: "overview",
  providers: "providers",
  providercfg: "providers",
  accounts: "providers",
  apps: "overview",
  models: "models",
  usage: "usage",
};

const VIEW_COMPONENTS: Record<
  ModelGatewayView,
  (props: ModelGatewayViewProps) => React.JSX.Element
> = {
  overview: OverviewView,
  providers: ProvidersView,
  providercfg: ProviderConfigView,
  models: ModelsView,
  accounts: AccountPoolView,
  apps: AppConnectionsView,
  usage: UsageView,
};

function isModelGatewayView(value: string | null): value is ModelGatewayView {
  return value != null && (MODEL_GATEWAY_VIEWS as readonly string[]).includes(value);
}

function isAppConnectionId(value: string | null): value is ModelGatewayAppConnectionId {
  return value != null && (MODEL_GATEWAY_APP_CONNECTION_IDS as readonly string[]).includes(value);
}

/**
 * Model Gateway page. Owns the primary `viewbar` tabs and the sub-view state
 * machine over the exact `data-view` set
 * (`overview|providers|providercfg|models|accounts|apps|usage`). The active
 * view and the `apps` deep-link are driven entirely from the URL search params
 * (`?view=`, `?tab=connections&app=<cli>`), so views are deep-linkable and the
 * browser back/forward buttons work. Content lives in `./views`.
 */
export function ModelGatewayPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const tabParam = searchParams.get("tab");
  const appParam = searchParams.get("app");
  const providerParam = searchParams.get("provider");
  const createParam = searchParams.get("create");

  // `?tab=connections` is the documented deep-link alias into the apps view.
  const resolvedView: ModelGatewayView = isModelGatewayView(viewParam)
    ? viewParam
    : tabParam === "connections"
      ? "apps"
      : "overview";

  const selectedApp = isAppConnectionId(appParam) ? appParam : null;
  const selectedProvider = providerParam && providerParam.length > 0 ? providerParam : null;
  const createMode = createParam === "1" || createParam === "true";

  const goToView = React.useCallback<ModelGatewayViewProps["goToView"]>(
    (view, params) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", view);
          next.delete("tab");
          if (params?.app) {
            next.set("app", params.app);
          } else {
            next.delete("app");
          }
          if (params?.provider) {
            next.set("provider", params.provider);
          } else {
            next.delete("provider");
          }
          if (params?.create) {
            next.set("create", "1");
          } else {
            next.delete("create");
          }
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const ActiveView = VIEW_COMPONENTS[resolvedView];
  const activeTab = SUB_VIEW_PARENT[resolvedView];

  return (
    <div className="grid gap-4">
      {/* Primary viewbar */}
      <nav
        className="flex flex-wrap gap-1 border-b border-line pb-2"
        aria-label="模型网关视图"
      >
        {PRIMARY_TABS.map(({ view, label, icon: Icon }) => {
          const active = activeTab === view;
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

      <ActiveView goToView={goToView} selectedApp={selectedApp} selectedProvider={selectedProvider} createMode={createMode} />
    </div>
  );
}
