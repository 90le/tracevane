/**
 * Channel Connectors view set + the navigation contract passed down to views.
 *
 * Tabs mirror the prototype IA + old page: overview / bindings / sessions /
 * logs. The active view is driven entirely from the URL search params
 * (`?view=`), so views are deep-linkable.
 */
export const CHANNEL_CONNECTORS_VIEWS = [
  "overview",
  "bindings",
  "sessions",
  "logs",
] as const;

export type ChannelConnectorsView = (typeof CHANNEL_CONNECTORS_VIEWS)[number];

/** Navigation params a view can carry across a view switch. */
export interface ChannelConnectorsViewNavParams {
  /** Deep-link a platform binding id (`bindings` view). */
  binding?: string;
}

/** Imperative navigation the page passes down so a view can switch views. */
export interface ChannelConnectorsViewNavigation {
  goToView: (view: ChannelConnectorsView, params?: ChannelConnectorsViewNavParams) => void;
}

export interface ChannelConnectorsViewProps extends ChannelConnectorsViewNavigation {
  /** Deep-link target for the `bindings` view (`?binding=`); null when unset. */
  selectedBinding: string | null;
}
