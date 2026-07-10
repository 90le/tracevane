/**
 * Channel Connectors view set + the navigation contract passed down to views.
 *
 * v3 IA contract: overview / workspaces / accounts / sessions / runtime.
 * The active view is driven entirely from URL search params (`?view=`), so
 * views are deep-linkable.
 */
export const CHANNEL_CONNECTORS_VIEWS = [
  "overview",
  "workspaces",
  "accounts",
  "sessions",
  "runtime",
] as const;

export type ChannelConnectorsView = (typeof CHANNEL_CONNECTORS_VIEWS)[number];

/** Navigation params a view can carry across a view switch. */
export interface ChannelConnectorsViewNavParams {
  account?: string;
  target?: string;
}

/** Imperative navigation the page passes down so a view can switch views. */
export interface ChannelConnectorsViewNavigation {
  goToView: (view: ChannelConnectorsView, params?: ChannelConnectorsViewNavParams) => void;
}

export interface ChannelConnectorsViewProps extends ChannelConnectorsViewNavigation {
  selectedAccount: string | null;
  selectedTarget: string | null;
}
