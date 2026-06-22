/**
 * External Connections view set + navigation contract.
 *
 * Tabs mirror the prototype IA + old page: overview / connections /
 * capabilities / auth. The active view + selected connection are driven from
 * the URL search params (`?view=`, `?conn=<id>`), so views are deep-linkable.
 */
export const EXTERNAL_VIEWS = [
  "overview",
  "connections",
  "capabilities",
  "auth",
] as const;

export type ExternalView = (typeof EXTERNAL_VIEWS)[number];

/** Navigation params a view can carry across a view switch. */
export interface ExternalViewNavParams {
  /** Deep-link a connection id into the `connections` inspector. */
  conn?: string;
}

/** Imperative navigation the page passes down so a view can switch views. */
export interface ExternalViewNavigation {
  goToView: (view: ExternalView, params?: ExternalViewNavParams) => void;
}

export interface ExternalViewProps extends ExternalViewNavigation {
  /** Deep-link target for the `connections` inspector (`?conn=`); null when unset. */
  selectedConnection: string | null;
}
