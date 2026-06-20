import { createContext, useContext } from "react";

export interface SheetPayload {
  title?: string;
  sub?: string;
  status?: string;
  owner?: string;
  action?: string;
  note?: string;
  log?: string | string[];
  diff?: string;
}

export interface DialogPayload {
  title?: string;
  body?: string;
  tone?: "info" | "warn" | "danger";
  icon?: string;
  okLabel?: string;
  onConfirm?: () => void;
}

export interface StateOptions {
  title?: string;
  emptyTitle?: string;
  desc?: string;
  emptyDesc?: string;
  action?: string;
  icon?: string;
  count?: number;
  onRetry?: () => void;
}

export interface ShellApi {
  openSheet: (payload: SheetPayload) => void;
  openSheetLegacy: (value: string | null) => void;
  closeSheet: () => void;
  openDialog: (payload: DialogPayload) => void;
  closeDialog: () => void;
  toast: (message: string, tone?: "ok" | "warn" | "info") => void;
  states: (container: Element | null, kind: "skeleton-rows" | "skeleton-cards" | "loading" | "empty" | "error", opts?: StateOptions) => Element | null;
  refreshIcons: () => void;
  bindListSearch: (stage: Element, opts?: StateOptions) => void;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside AuroraShell");
  return shell;
}
