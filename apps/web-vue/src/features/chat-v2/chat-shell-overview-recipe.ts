export interface ChatShellQuickActions {
  canToggleRecordBrowser: boolean;
  recordBrowserOpen: boolean;
  recordBrowserHasActiveFilters: boolean;
  historyMode: "history" | "search";
  inspectPinned: boolean;
}

export function buildChatShellQuickActions(params: {
  selectedSessionKey: string;
  recordBrowserOpen: boolean;
  recordBrowserHasActiveFilters: boolean;
  historyMode: "history" | "search";
  inspectPinned: boolean;
}): ChatShellQuickActions {
  return {
    canToggleRecordBrowser: Boolean(params.selectedSessionKey),
    recordBrowserOpen: params.recordBrowserOpen,
    recordBrowserHasActiveFilters: params.recordBrowserHasActiveFilters,
    historyMode: params.historyMode,
    inspectPinned: params.inspectPinned,
  };
}

export interface ChatShellWarnings {
  gatewayWarning: string;
  accessError: string;
  inspectorWarningMessage: string;
}

export function buildChatShellWarnings(params: {
  gatewayWarning: string;
  accessError: string;
  runtimeLastErrorMessage: string;
}): ChatShellWarnings {
  const gatewayWarning = params.gatewayWarning.trim();
  const accessError = params.accessError.trim();
  const runtimeLastErrorMessage = params.runtimeLastErrorMessage.trim();

  return {
    gatewayWarning,
    accessError,
    inspectorWarningMessage:
      gatewayWarning || accessError || runtimeLastErrorMessage,
  };
}
