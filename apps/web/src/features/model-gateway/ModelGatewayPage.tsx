import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { SectionNav } from "@/design/ui/section-nav";
import { LoadingState } from "@/shared/states/LoadingState";

import {
  MODEL_GATEWAY_APP_CONNECTION_IDS,
  type ModelGatewayAppConnectionId,
} from "./types";
import {
  MODEL_GATEWAY_VIEWS,
  type ModelGatewayView,
  type ModelGatewayViewProps,
} from "./views/types";

/** Primary `viewbar` tabs (IA contract: overview / providers / models / usage). */
const PRIMARY_TABS: ReadonlyArray<{
  view: ModelGatewayView;
  label: string;
}> = [
  { view: "overview", label: "概览" },
  { view: "providers", label: "服务商" },
  { view: "models", label: "模型" },
  { view: "usage", label: "用量" },
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
  React.LazyExoticComponent<(props: ModelGatewayViewProps) => React.JSX.Element>
> = {
  overview: React.lazy(() =>
    import("./views/OverviewView").then((module) => ({
      default: module.OverviewView,
    })),
  ),
  providers: React.lazy(() =>
    import("./views/ProvidersView").then((module) => ({
      default: module.ProvidersView,
    })),
  ),
  providercfg: React.lazy(() =>
    import("./views/ProviderConfigView").then((module) => ({
      default: module.ProviderConfigView,
    })),
  ),
  models: React.lazy(() =>
    import("./views/ModelsView").then((module) => ({
      default: module.ModelsView,
    })),
  ),
  accounts: React.lazy(() =>
    import("./views/AccountPoolView").then((module) => ({
      default: module.AccountPoolView,
    })),
  ),
  apps: React.lazy(() =>
    import("./views/AppConnectionsView").then((module) => ({
      default: module.AppConnectionsView,
    })),
  ),
  usage: React.lazy(() =>
    import("./views/UsageView").then((module) => ({
      default: module.UsageView,
    })),
  ),
};

function isModelGatewayView(value: string | null): value is ModelGatewayView {
  return (
    value != null && (MODEL_GATEWAY_VIEWS as readonly string[]).includes(value)
  );
}

function isAppConnectionId(
  value: string | null,
): value is ModelGatewayAppConnectionId {
  return (
    value != null &&
    (MODEL_GATEWAY_APP_CONNECTION_IDS as readonly string[]).includes(value)
  );
}

function ModelGatewayViewFallback() {
  return (
    <div className="rounded-md border border-line bg-panel p-6 shadow-sm">
      <LoadingState
        title="正在打开模型路由视图"
        description="只加载当前视图所需代码，避免概览页携带其它管理页。"
      />
    </div>
  );
}

/**
 * Model Gateway page. Owns the primary `viewbar` tabs and the sub-view state
 * machine over the exact `data-view` set
 * (`overview|providers|providercfg|models|accounts|apps|usage`). The active
 * view and the `apps` deep-link are driven entirely from the URL search params
 * (`?view=`, `?tab=connections&app=<cli>`), so views are deep-linkable and the
 * browser back/forward buttons work. Content lives in `./views` and is lazy
 * loaded per view so `/model-gateway?view=overview` does not ship every
 * provider/model/usage management screen up front.
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
  const selectedProvider =
    providerParam && providerParam.length > 0 ? providerParam : null;
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
      <div className="border-b border-line pb-2 sm:hidden">
        <label className="sr-only" htmlFor="model-gateway-mobile-view">
          模型路由视图
        </label>
        <select
          id="model-gateway-mobile-view"
          value={activeTab}
          onChange={(event) => goToView(event.target.value as ModelGatewayView)}
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
          items={PRIMARY_TABS.map(({ view, label }) => ({ id: view, label }))}
          value={activeTab}
          onChange={(id) => goToView(id as ModelGatewayView)}
          ariaLabel="模型路由视图"
        />
      </nav>

      <React.Suspense fallback={<ModelGatewayViewFallback />}>
        <ActiveView
          goToView={goToView}
          selectedApp={selectedApp}
          selectedProvider={selectedProvider}
          createMode={createMode}
        />
      </React.Suspense>
    </div>
  );
}
