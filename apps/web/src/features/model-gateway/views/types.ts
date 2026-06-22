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

/** Navigation params a view can carry across a sub-view switch. */
export interface ModelGatewayViewNavParams {
  /** Deep-link an app connection (`apps` view). */
  app?: ModelGatewayAppConnectionId;
  /**
   * Deep-link a provider id for the `providercfg` / `accounts` child views.
   * Omit (with `create`) to open `providercfg` in create mode.
   */
  provider?: string;
  /** Open `providercfg` in create mode (no existing provider selected). */
  create?: boolean;
}

/** Imperative navigation the page passes down so a view can switch sub-views. */
export interface ModelGatewayViewNavigation {
  /** Switch to another `data-view`. Optionally deep-link an app/provider target. */
  goToView: (view: ModelGatewayView, params?: ModelGatewayViewNavParams) => void;
}

export interface ModelGatewayViewProps extends ModelGatewayViewNavigation {
  /** Deep-link target for the `apps` view (`?app=<cli>`); null when unset. */
  selectedApp: ModelGatewayAppConnectionId | null;
  /** Deep-link provider id for `providercfg` / `accounts` (`?provider=`); null when unset. */
  selectedProvider: string | null;
  /** Whether `providercfg` should open in create mode (`?create=1`). */
  createMode: boolean;
}
