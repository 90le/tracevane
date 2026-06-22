import type { ModelGatewayAppConnectionId } from "../types";

/**
 * The exact `data-view` set from the prototype IA contract. The primary tabs
 * (overview / providers / models / usage) plus the three child flows
 * (providercfg / accounts / apps) reachable from those tabs.
 */
export const MODEL_GATEWAY_VIEWS = [
  "overview",
  "providers",
  "providercfg",
  "models",
  "accounts",
  "apps",
  "usage",
] as const;

export type ModelGatewayView = (typeof MODEL_GATEWAY_VIEWS)[number];

/** Imperative navigation the page passes down so a view can switch sub-views. */
export interface ModelGatewayViewNavigation {
  /** Switch to another `data-view`. Optionally deep-link an app connection. */
  goToView: (view: ModelGatewayView, params?: { app?: ModelGatewayAppConnectionId }) => void;
}

export interface ModelGatewayViewProps extends ModelGatewayViewNavigation {
  /** Deep-link target for the `apps` view (`?app=<cli>`); null when unset. */
  selectedApp: ModelGatewayAppConnectionId | null;
}
